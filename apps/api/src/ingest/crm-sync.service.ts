import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CrmConnector, CrmRef, RawDeal, RawLead } from '@adlink/core';
import { CanonicalStatus } from '@adlink/db';
import { rollupCanonical } from '../crm/canonical.js';
import { ContactResolver } from '../identity/contact-resolver.service.js';
import { SyncRunService } from '../jobs/sync-run.service.js';
import { MatchingService } from '../matching/matching.service.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

/**
 * Pulls a CRM into canonical Contacts/Leads/Deals. Each deal's stage is mapped to
 * a canonical status via the tenant's StageMapping config (PLAN §6.2). Idempotent:
 * deals upsert on (tenant, externalId); contacts dedup by identifier.
 */
@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly syncRun: SyncRunService,
    private readonly contacts: ContactResolver,
    private readonly matching: MatchingService,
  ) {}

  async sync(connector: CrmConnector, conn: CrmRef, tenantId: string, since = new Date(0)) {
    const run = await this.syncRun.start(tenantId, 'crm_sync');
    await this.db.$base.crmConnection
      .update({ where: { id: conn.id }, data: { syncState: 'RUNNING' } })
      .catch(() => undefined);
    try {
      const mappings = await this.loadMappings(conn.id);

      const rawContacts = await connector.fetchContacts(conn, since);
      const contactByExternal = new Map<string, string>();
      for (const c of rawContacts) {
        const id = await this.contacts.resolve(tenantId, c);
        if (id) contactByExternal.set(c.externalId, id);
      }

      const rawLeads = await connector.fetchLeads(conn, since);
      for (const l of rawLeads) await this.upsertLead(tenantId, l);

      // Stage history → a deal counts as qualified/won if it was *ever* in such a stage.
      const histByDeal = new Map<string, Set<string>>();
      if (connector.fetchDealStageHistory) {
        for (const h of await connector.fetchDealStageHistory(conn, since)) {
          const set = histByDeal.get(h.dealExternalId) ?? new Set<string>();
          set.add(h.stageExternalId);
          histByDeal.set(h.dealExternalId, set);
        }
      }

      const rawDeals = await connector.fetchDeals(conn, since);
      for (const d of rawDeals) {
        const stages = [...new Set([d.stageExternalId, ...(histByDeal.get(d.externalId) ?? [])])];
        const canonical = rollupCanonical(stages, mappings, d.stageExternalId);
        const contactId = d.contactExternalId
          ? (contactByExternal.get(d.contactExternalId) ?? null)
          : null;
        await this.upsertDeal(tenantId, d, canonical, contactId, stages);
      }

      // Attribute freshly-ingested leads to ads (leadgen/utm/contact-dedup signals).
      const m = await this.matching.matchUnmatched(tenantId);

      await this.db.$base.crmConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: new Date(), syncState: 'OK' },
      });
      await this.syncRun.finish(run.id, 'OK');
      this.logger.log(
        `crm sync ok: ${rawDeals.length} deals, ${rawLeads.length} leads, matched ${m.matched}/${m.processed}`,
      );
    } catch (err) {
      await this.syncRun.finish(run.id, 'FAILED', err instanceof Error ? err.message : String(err));
      await this.db.$base.crmConnection
        .update({ where: { id: conn.id }, data: { syncState: 'FAILED' } })
        .catch(() => undefined);
      throw err;
    }
  }

  private async loadMappings(crmConnectionId: string): Promise<Map<string, CanonicalStatus>> {
    const rows = await this.db.$base.stageMapping.findMany({
      where: { crmConnectionId },
      select: { externalStageId: true, canonical: true },
    });
    return new Map(rows.map((r) => [r.externalStageId, r.canonical]));
  }

  private async upsertLead(tenantId: string, l: RawLead) {
    if (!l.externalId) return;
    const contactId = await this.contacts.resolve(tenantId, l);
    // Attribution signals the matcher reads — persist them so matching has something to work with.
    const signals = {
      leadgenId: l.leadgenId ?? null,
      fbclid: l.fbclid ?? null,
      utmSource: l.utm?.source ?? null,
      utmMedium: l.utm?.medium ?? null,
      utmCampaign: l.utm?.campaign ?? null,
      utmContent: l.utm?.content ?? null,
      utmTerm: l.utm?.term ?? null,
    };
    // Deterministic ad id only if the lead already carries the Meta ad externalId.
    const adId = l.adExternalId
      ? ((await this.db.$base.ad.findFirst({ where: { tenantId, externalId: l.adExternalId }, select: { id: true } }))?.id ?? null)
      : null;
    await this.db.$base.lead.upsert({
      where: { tenantId_source_externalId: { tenantId, source: l.source, externalId: l.externalId } },
      create: {
        tenantId,
        source: l.source,
        externalId: l.externalId,
        contactId,
        createdAt: new Date(l.createdAt),
        ...signals,
        adId, // seed only on first insert; never overwrite a resolved match on re-sync
      },
      // re-sync refreshes raw signals but must NOT touch adId/matchStatus (preserves matches)
      update: { contactId, ...signals },
    });
  }

  private async upsertDeal(
    tenantId: string,
    d: RawDeal,
    canonical: CanonicalStatus,
    contactId: string | null,
    stageHistory: string[],
  ) {
    const data = {
      stageExternalId: d.stageExternalId,
      stageHistory,
      canonical,
      amount: d.amount ?? null,
      currency: d.currency ?? null,
      createdAt: new Date(d.createdAt),
      wonAt: d.wonAt ? new Date(d.wonAt) : null,
      contactId,
    };
    await this.db.$base.deal.upsert({
      where: { tenantId_externalId: { tenantId, externalId: d.externalId } },
      create: { tenantId, externalId: d.externalId, ...data },
      update: data,
    });
  }
}
