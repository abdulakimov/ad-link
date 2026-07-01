import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AdAccountRef,
  type AdConnector,
  type DateRange,
  parseCreativeName,
  type RawAd,
  type RawHierarchy,
  type RawInsight,
} from '@adlink/core';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';
import { SyncRunService } from '../jobs/sync-run.service.js';

/** Last `days` days as an inclusive YYYY-MM-DD range. */
export function trailingRange(days: number, now = new Date()): DateRange {
  const to = now;
  const from = new Date(to.getTime() - days * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/**
 * Pulls a Meta ad account into canonical entities. Every write is an idempotent
 * upsert keyed on the provider's external id, so re-running a sync (the nightly
 * trailing-window reconcile) never double-counts (PLAN §5/§7.1).
 */
@Injectable()
export class MetaSyncService {
  private readonly logger = new Logger(MetaSyncService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly syncRun: SyncRunService,
  ) {}

  async sync(
    connector: AdConnector,
    acc: AdAccountRef,
    tenantId: string,
    opts: { trailingDays?: number; connectedAt?: Date } = {},
  ) {
    const run = await this.syncRun.start(tenantId, 'meta_sync');
    await this.db.$base.adAccount
      .update({ where: { id: acc.id }, data: { syncState: 'RUNNING' } })
      .catch(() => undefined);
    try {
      const hierarchy = await connector.fetchAdHierarchy(acc);
      await this.upsertHierarchy(tenantId, acc.id, hierarchy);

      // Never reach before the account was connected — no pre-connection spend (PLAN).
      const range = trailingRange(opts.trailingDays ?? 28);
      const floorIso = opts.connectedAt?.toISOString().slice(0, 10);
      if (floorIso && floorIso > range.from) range.from = floorIso;
      const insights = await connector.fetchInsights(acc, range);
      await this.upsertInsights(tenantId, acc.id, insights, opts.connectedAt);

      await this.db.$base.adAccount.update({
        where: { id: acc.id },
        data: { lastSyncAt: new Date(), syncState: 'OK' },
      });
      await this.syncRun.finish(run.id, 'OK');
      this.logger.log(`meta sync ok for ${acc.externalId}: ${insights.length} insight rows`);
    } catch (err) {
      await this.syncRun.finish(run.id, 'FAILED', err instanceof Error ? err.message : String(err));
      await this.db.$base.adAccount
        .update({ where: { id: acc.id }, data: { syncState: 'FAILED' } })
        .catch(() => undefined);
      throw err;
    }
  }

  private async upsertHierarchy(tenantId: string, adAccountId: string, h: RawHierarchy) {
    for (const c of h.campaigns) {
      const campaign = await this.db.$base.campaign.upsert({
        where: { adAccountId_externalId: { adAccountId, externalId: c.externalId } },
        create: {
          tenantId,
          adAccountId,
          externalId: c.externalId,
          name: c.name,
          status: c.status ?? null,
          effectiveStatus: c.effectiveStatus ?? null,
        },
        update: { name: c.name, status: c.status ?? null, effectiveStatus: c.effectiveStatus ?? null },
      });
      for (const s of c.adSets) {
        const adSet = await this.db.$base.adSet.upsert({
          where: { campaignId_externalId: { campaignId: campaign.id, externalId: s.externalId } },
          create: {
            tenantId,
            campaignId: campaign.id,
            externalId: s.externalId,
            name: s.name,
            status: s.status ?? null,
            effectiveStatus: s.effectiveStatus ?? null,
          },
          update: { name: s.name, status: s.status ?? null, effectiveStatus: s.effectiveStatus ?? null },
        });
        for (const a of s.ads) {
          const creativeId = await this.upsertCreative(tenantId, a);
          await this.db.$base.ad.upsert({
            where: { adSetId_externalId: { adSetId: adSet.id, externalId: a.externalId } },
            create: {
              tenantId,
              adSetId: adSet.id,
              externalId: a.externalId,
              name: a.name,
              status: a.status ?? null,
              effectiveStatus: a.effectiveStatus ?? null,
              creativeId,
            },
            update: {
              name: a.name,
              status: a.status ?? null,
              effectiveStatus: a.effectiveStatus ?? null,
              creativeId,
            },
          });
        }
      }
    }
  }

  /** Find-or-update a creative by external id (sync is serialized per account). */
  private async upsertCreative(tenantId: string, ad: RawAd): Promise<string | null> {
    if (!ad.creativeExternalId) return null;
    const parsed = parseCreativeName(ad.creativeName ?? '');
    const existing = await this.db.$base.creative.findFirst({
      where: { tenantId, externalId: ad.creativeExternalId },
      select: { id: true },
    });
    if (existing) {
      await this.db.$base.creative.update({
        where: { id: existing.id },
        data: { name: ad.creativeName ?? null, ...parsed },
      });
      return existing.id;
    }
    const created = await this.db.$base.creative.create({
      data: { tenantId, externalId: ad.creativeExternalId, name: ad.creativeName ?? null, ...parsed },
    });
    return created.id;
  }

  private async upsertInsights(
    tenantId: string,
    adAccountId: string,
    insights: RawInsight[],
    connectedAt?: Date,
  ) {
    const ads = await this.db.$base.ad.findMany({
      where: { tenantId, adSet: { campaign: { adAccountId } } },
      select: { id: true, externalId: true },
    });
    const byExternal = new Map(ads.map((a) => [a.externalId, a.id]));
    const floorIso = connectedAt?.toISOString().slice(0, 10);

    for (const ins of insights) {
      const adId = byExternal.get(ins.adExternalId);
      if (!adId) continue; // insight for an ad we haven't ingested — skip
      if (floorIso && ins.date < floorIso) continue; // pre-connection day — don't store
      const date = new Date(`${ins.date}T00:00:00.000Z`);
      const data = {
        currency: ins.currency,
        spend: ins.spend,
        impressions: ins.impressions,
        clicks: ins.clicks,
        reach: ins.reach ?? null,
        frequency: ins.frequency ?? null,
      };
      await this.db.$base.adInsightDaily.upsert({
        where: { adId_date: { adId, date } },
        create: { tenantId, adId, date, ...data },
        update: data,
      });
    }
  }
}
