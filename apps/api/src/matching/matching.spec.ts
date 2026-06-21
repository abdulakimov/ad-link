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

    const contact = await db.$base.contact.create({ data: { tenantId, name: 'Ali' } });

    // Meta Lead Ad — already attributed at ingest
    await db.$base.lead.create({
      data: { tenantId, source: 'META_LEAD_AD', leadgenId: 'lg1', externalId: 'M1', adId, contactId: contact.id, matchStatus: 'MATCHED', matchMethod: 'LEADGEN_ID', confidence: 1, createdAt: new Date() },
    });
    // CRM lead — same person, not yet attributed
    await db.$base.lead.create({
      data: { tenantId, source: 'CRM', externalId: 'L1', contactId: contact.id, matchStatus: 'UNMATCHED', createdAt: new Date() },
    });
    // Website lead — ad id in utm_content
    await db.$base.lead.create({
      data: { tenantId, source: 'WEBSITE', externalId: 'W1', utmContent: 'A1', matchStatus: 'UNMATCHED', createdAt: new Date() },
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

  it('attributes leads via contact sibling and utm, routing weak matches to review', async () => {
    const result = await service.matchUnmatched(tenantId);
    expect(result.processed).toBe(2);

    const crm = await db.$base.lead.findFirst({ where: { tenantId, externalId: 'L1' } });
    expect(crm).toMatchObject({ adId, matchMethod: 'PHONE', matchStatus: 'MATCHED' });

    const web = await db.$base.lead.findFirst({ where: { tenantId, externalId: 'W1' } });
    expect(web).toMatchObject({ adId, matchMethod: 'UTM', matchStatus: 'REVIEW' });
  });

  it('reports an account match rate and review queue', async () => {
    const rate = await service.matchRate(tenantId);
    expect(rate).toMatchObject({ total: 3, matched: 2, review: 1 });
    expect((await service.reviewQueue(tenantId)).length).toBe(1);
  });
});
