import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { decideMatch, type MatchCandidate } from '@adlink/core';
import { Prisma, type Lead } from '@adlink/db';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

/**
 * Identity resolution (PLAN §8): link each Lead to the Ad that produced it using
 * deterministic signals, in priority order. Every attributed edge is auditable.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async matchLead(tenantId: string, lead: Lead) {
    const candidates: MatchCandidate[] = [];

    // 1. Meta Lead Ad — leadgen_id carries the ad deterministically at ingest
    if (lead.leadgenId && lead.adId) candidates.push({ method: 'LEADGEN_ID', adId: lead.adId });

    // 2. Same person already attributed (contact deduped by phone/email)
    if (lead.contactId) {
      const sibling = await this.db.$base.lead.findFirst({
        where: { tenantId, contactId: lead.contactId, adId: { not: null }, id: { not: lead.id } },
        select: { adId: true },
      });
      if (sibling?.adId) candidates.push({ method: 'PHONE', adId: sibling.adId });
    }

    // 3. utm_content carrying the ad identity via a tagged link. Two conventions:
    //    utm_content={{ad.id}}   → matches an ad externalId (deterministic)
    //    utm_content={{ad.name}} → matches an ad name; unique name = deterministic,
    //                              a reused name is ambiguous → parked for review.
    if (lead.utmContent) {
      const byId = await this.db.$base.ad.findFirst({
        where: { tenantId, externalId: lead.utmContent },
        select: { id: true },
      });
      if (byId) {
        candidates.push({ method: 'UTM', adId: byId.id, confidence: 0.95 });
      } else {
        const byName = await this.db.$base.ad.findMany({
          where: { tenantId, name: lead.utmContent },
          select: { id: true },
        });
        if (byName.length === 1) {
          candidates.push({ method: 'UTM', adId: byName[0]!.id, confidence: 0.9 }); // unique → match
        } else if (byName.length > 1) {
          // Ambiguous name → break the tie by which of those ads actually spent
          // around the lead's date; only that ad could have produced the lead.
          const winner = await this.disambiguateBySpend(
            byName.map((a) => a.id),
            lead.createdAt,
          );
          if (winner) candidates.push({ method: 'UTM', adId: winner, confidence: 0.8 }); // → match
          else candidates.push({ method: 'UTM', adId: byName[0]!.id }); // undecidable → review (0.5)
        }
      }
    }

    const decision = decideMatch(candidates);
    await this.db.$base.lead.update({
      where: { id: lead.id },
      data: {
        adId: decision.adId,
        matchMethod: decision.method,
        confidence: decision.confidence,
        matchStatus: decision.status,
      },
    });
    if (decision.adId && decision.method) {
      await this.db.$base.matchAudit.create({
        data: {
          tenantId,
          leadId: lead.id,
          method: decision.method,
          confidence: decision.confidence,
          resolvedBy: 'engine',
          detail: { candidates } as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return decision;
  }

  /**
   * Among several same-named ads, pick the one that actually spent — first on the lead's
   * own day (the ad that was live when the lead came in), else the only ad that ever spent.
   * Returns null when it can't be decided (0 or several spenders) → caller routes to review.
   */
  private async disambiguateBySpend(adIds: string[], leadAt: Date): Promise<string | null> {
    const day = new Date(Date.UTC(leadAt.getUTCFullYear(), leadAt.getUTCMonth(), leadAt.getUTCDate()));
    const sameDay = await this.db.$base.adInsightDaily.findMany({
      where: { adId: { in: adIds }, date: day, spend: { gt: 0 } },
      select: { adId: true },
      orderBy: { spend: 'desc' },
    });
    if (sameDay.length) return sameDay[0]!.adId; // the (top) ad spending that day

    // No spend on the lead's day → if exactly one of these ads ever spent, it's the one.
    const ever = await this.db.$base.adInsightDaily.groupBy({
      by: ['adId'],
      where: { adId: { in: adIds }, spend: { gt: 0 } },
      _sum: { spend: true },
    });
    return ever.length === 1 ? ever[0]!.adId : null;
  }

  async matchUnmatched(tenantId: string) {
    const leads = await this.db.$base.lead.findMany({
      where: { tenantId, matchStatus: { in: ['UNMATCHED', 'REVIEW'] } },
    });
    let matched = 0;
    for (const lead of leads) {
      const d = await this.matchLead(tenantId, lead);
      if (d.status === 'MATCHED') matched++;
    }
    this.logger.log(`matched ${matched}/${leads.length} leads`);
    return { processed: leads.length, matched };
  }

  async resolveManual(tenantId: string, leadId: string, adId: string, userId: string) {
    const lead = await this.db.$base.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundException('Lead not found');
    const ad = await this.db.$base.ad.findFirst({ where: { id: adId, tenantId } });
    if (!ad) throw new NotFoundException('Ad not found');
    await this.db.$base.lead.update({
      where: { id: leadId },
      data: { adId, matchMethod: 'MANUAL', confidence: 1, matchStatus: 'MATCHED' },
    });
    await this.db.$base.matchAudit.create({
      data: { tenantId, leadId, method: 'MANUAL', confidence: 1, resolvedBy: userId, detail: { adId } },
    });
    return { ok: true };
  }

  /** Account-level trust signal: % of leads attributed to an ad. */
  async matchRate(tenantId: string) {
    const [total, matched, review] = await Promise.all([
      this.db.$base.lead.count({ where: { tenantId } }),
      this.db.$base.lead.count({ where: { tenantId, matchStatus: 'MATCHED' } }),
      this.db.$base.lead.count({ where: { tenantId, matchStatus: 'REVIEW' } }),
    ]);
    return {
      total,
      matched,
      review,
      unmatched: total - matched - review,
      rate: total ? matched / total : null,
    };
  }

  reviewQueue(tenantId: string) {
    return this.db.$base.lead.findMany({
      where: { tenantId, matchStatus: 'REVIEW' },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Flat ad list for the manual-resolution picker. */
  async listAds(tenantId: string) {
    const ads = await this.db.$base.ad.findMany({
      where: { tenantId },
      select: { id: true, name: true, adSet: { select: { name: true, campaign: { select: { name: true } } } } },
      orderBy: { name: 'asc' },
      take: 1000,
    });
    return ads.map((a) => ({ id: a.id, name: a.name, adSet: a.adSet.name, campaign: a.adSet.campaign.name }));
  }
}
