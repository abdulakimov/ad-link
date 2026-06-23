import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../prisma/prisma.client.js';
import { MatchingService } from './matching.service.js';

const db = createPrismaClient();
const service = new MatchingService(db);

describe('MatchingService', () => {
  let tenantId = '';
  let adId = '';

  beforeAll(async () => {
    const tenant = await db.$base.tenant.create({ data: { name: 'match-test' } });
    tenantId = tenant.id;
    const client = await db.$base.client.create({ data: { tenantId, name: 'c' } });
    const acc = await db.$base.adAccount.create({
      data: { tenantId, clientId: client.id, externalId: 'act_m', currency: 'USD', timezone: 'UTC', tokenRef: 'x' },
    });
    const campaign = await db.$base.campaign.create({ data: { tenantId, adAccountId: acc.id, externalId: 'C1', name: 'C' } });
    const adSet = await db.$base.adSet.create({ data: { tenantId, campaignId: campaign.id, externalId: 'S1', name: 'S' } });
    const ad = await db.$base.ad.create({ data: { tenantId, adSetId: adSet.id, externalId: 'A1', name: 'Ad 1' } });
    adId = ad.id;
    // Two ads share a name → utm_content by that name is ambiguous (must go to review).
    await db.$base.ad.create({ data: { tenantId, adSetId: adSet.id, externalId: 'A2', name: 'Dup Ad' } });
    await db.$base.ad.create({ data: { tenantId, adSetId: adSet.id, externalId: 'A3', name: 'Dup Ad' } });

    const contact = await db.$base.contact.create({ data: { tenantId, name: 'Ali' } });

    // Meta Lead Ad — already attributed at ingest
    await db.$base.lead.create({
      data: { tenantId, source: 'META_LEAD_AD', leadgenId: 'lg1', externalId: 'M1', adId, contactId: contact.id, matchStatus: 'MATCHED', matchMethod: 'LEADGEN_ID', confidence: 1, createdAt: new Date() },
    });
    // CRM lead — same person, not yet attributed
    await db.$base.lead.create({
      data: { tenantId, source: 'CRM', externalId: 'L1', contactId: contact.id, matchStatus: 'UNMATCHED', createdAt: new Date() },
    });
    // Website lead — ad externalId in utm_content (deterministic → matched)
    await db.$base.lead.create({
      data: { tenantId, source: 'WEBSITE', externalId: 'W1', utmContent: 'A1', matchStatus: 'UNMATCHED', createdAt: new Date() },
    });
    // Website lead — a duplicated ad NAME in utm_content (ambiguous → review)
    await db.$base.lead.create({
      data: { tenantId, source: 'WEBSITE', externalId: 'W2', utmContent: 'Dup Ad', matchStatus: 'UNMATCHED', createdAt: new Date() },
    });
  });

  afterAll(async () => {
    await db.$base.matchAudit.deleteMany({ where: { tenantId } });
    await db.$base.lead.deleteMany({ where: { tenantId } });
    await db.$base.contact.deleteMany({ where: { tenantId } });
    await db.$base.client.deleteMany({ where: { tenantId } });
    await db.$base.tenant.delete({ where: { id: tenantId } });
    await db.$base.$disconnect();
  });

  it('attributes leads via contact sibling and utm, routing ambiguous matches to review', async () => {
    const result = await service.matchUnmatched(tenantId);
    expect(result.processed).toBe(3);

    const crm = await db.$base.lead.findFirst({ where: { tenantId, externalId: 'L1' } });
    expect(crm).toMatchObject({ adId, matchMethod: 'PHONE', matchStatus: 'MATCHED' });

    // utm_content = ad externalId → deterministic → matched
    const web = await db.$base.lead.findFirst({ where: { tenantId, externalId: 'W1' } });
    expect(web).toMatchObject({ adId, matchMethod: 'UTM', matchStatus: 'MATCHED' });

    // utm_content = a duplicated ad name → ambiguous → review (never counted as revenue)
    const dup = await db.$base.lead.findFirst({ where: { tenantId, externalId: 'W2' } });
    expect(dup).toMatchObject({ matchMethod: 'UTM', matchStatus: 'REVIEW' });
  });

  it('reports an account match rate and review queue', async () => {
    const rate = await service.matchRate(tenantId);
    expect(rate).toMatchObject({ total: 4, matched: 3, review: 1 });
    expect((await service.reviewQueue(tenantId)).length).toBe(1);
  });
});
