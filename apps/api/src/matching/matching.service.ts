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

    // 3. utm_content carrying the ad id (deterministic web attribution via tagged links)
    if (lead.utmContent) {
      const ad = await this.db.$base.ad.findFirst({
        where: { tenantId, externalId: lead.utmContent },
        select: { id: true },
      });
      if (ad) candidates.push({ method: 'UTM', adId: ad.id });
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
