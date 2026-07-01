import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../prisma/prisma.client.js';
import { MetricsService } from './metrics.service.js';

const db = createPrismaClient();
const service = new MetricsService(db);
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('MetricsService', () => {
  let tenantId = '';
  let adId1 = '';
  let adId2 = '';

  beforeAll(async () => {
    const tenant = await db.$base.tenant.create({ data: { name: 'metrics-test', reportCurrency: 'USD' } });
    tenantId = tenant.id;
    const client = await db.$base.client.create({ data: { tenantId, name: 'c' } });
    const acc = await db.$base.adAccount.create({
      // connected well before the seeded data so the connection-date floor includes it
      data: { tenantId, clientId: client.id, externalId: 'act', currency: 'USD', timezone: 'UTC', tokenRef: 'x', createdAt: d('2026-06-01') },
    });
    const campaign = await db.$base.campaign.create({ data: { tenantId, adAccountId: acc.id, externalId: 'C1', name: 'Camp' } });
    const adSet = await db.$base.adSet.create({ data: { tenantId, campaignId: campaign.id, externalId: 'S1', name: 'Set' } });
    const cr1 = await db.$base.creative.create({ data: { tenantId, externalId: 'cr1', name: 'Vid1-hA', hook: 'A' } });
    const cr2 = await db.$base.creative.create({ data: { tenantId, externalId: 'cr2', name: 'Vid2-hB', hook: 'B' } });
    const ad1 = await db.$base.ad.create({ data: { tenantId, adSetId: adSet.id, externalId: 'A1', name: 'Ad 1', creativeId: cr1.id } });
    const ad2 = await db.$base.ad.create({ data: { tenantId, adSetId: adSet.id, externalId: 'A2', name: 'Ad 2', creativeId: cr2.id } });
    adId1 = ad1.id;
    adId2 = ad2.id;

    await db.$base.adInsightDaily.createMany({
      data: [
        { tenantId, adId: ad1.id, date: d('2026-06-10'), spend: 100, currency: 'USD', impressions: 1000, clicks: 50 },
        { tenantId, adId: ad2.id, date: d('2026-06-10'), spend: 50, currency: 'USD', impressions: 500, clicks: 20 },
      ],
    });

    // c1 touched Ad1 first (06-08) then Ad2 (06-10); later won $400.
    const c1 = await db.$base.contact.create({ data: { tenantId, name: 'Won' } });
    const c2 = await db.$base.contact.create({ data: { tenantId, name: 'Qual' } });
    await db.$base.lead.create({ data: { tenantId, source: 'META_LEAD_AD', externalId: 'La', adId: ad1.id, contactId: c1.id, matchStatus: 'MATCHED', createdAt: d('2026-06-08') } });
    await db.$base.lead.create({ data: { tenantId, source: 'WEBSITE', externalId: 'Lb', adId: ad2.id, contactId: c1.id, matchStatus: 'MATCHED', createdAt: d('2026-06-10') } });
    await db.$base.lead.create({ data: { tenantId, source: 'CRM', externalId: 'Lc', adId: ad1.id, contactId: c2.id, matchStatus: 'MATCHED', createdAt: d('2026-06-10') } });
    await db.$base.deal.create({ data: { tenantId, externalId: 'D1', contactId: c1.id, stageExternalId: 'won', canonical: 'WON', amount: 400, currency: 'USD', createdAt: d('2026-06-12') } });
    await db.$base.deal.create({ data: { tenantId, externalId: 'D2', contactId: c2.id, stageExternalId: 'q', canonical: 'QUALIFIED', amount: 0, currency: 'USD', createdAt: d('2026-06-12') } });
  });

  afterAll(async () => {
    await db.$base.deal.deleteMany({ where: { tenantId } });
    await db.$base.lead.deleteMany({ where: { tenantId } });
    await db.$base.contact.deleteMany({ where: { tenantId } });
    await db.$base.client.deleteMany({ where: { tenantId } });
    await db.$base.creative.deleteMany({ where: { tenantId } });
    await db.$base.tenant.delete({ where: { id: tenantId } });
    await db.$base.$disconnect();
  });

  const range = { from: '2026-06-01', to: '2026-06-30' };

  it('last-touch credits the won deal to the contact’s latest ad (Ad2)', async () => {
    const { rows } = await service.performance(tenantId, range, 'LAST_TOUCH');
    const a1 = rows.find((r) => r.id === adId1)!;
    const a2 = rows.find((r) => r.id === adId2)!;
    expect(a1).toMatchObject({ leads: 2, qualifiedLeads: 2, revenue: 0, sales: 0 });
    expect(a2).toMatchObject({ leads: 1, sales: 1, revenue: 400 });
  });

  it('first-touch credits the won deal to the contact’s earliest ad (Ad1)', async () => {
    const { rows } = await service.performance(tenantId, range, 'FIRST_TOUCH');
    const a1 = rows.find((r) => r.id === adId1)!;
    const a2 = rows.find((r) => r.id === adId2)!;
    expect(a1).toMatchObject({ leads: 2, sales: 1, revenue: 400, roas: 4 });
    expect(a2).toMatchObject({ revenue: 0, sales: 0 });
  });

  it('groups creative insights by hook (last-touch revenue lands on Ad2 = hook B)', async () => {
    const { rows } = await service.creativeInsights(tenantId, range, 'hook', 'LAST_TOUCH');
    const hookA = rows.find((r) => r.value === 'A')!;
    const hookB = rows.find((r) => r.value === 'B')!;
    expect(hookB.revenue).toBe(400);
    expect(hookA.revenue).toBe(0);
  });

  it('cohort report totals leads + revenue by lead-created week', async () => {
    const { cohorts } = await service.cohorts(tenantId, range);
    const totalLeads = cohorts.reduce((s, c) => s + c.leads, 0);
    const totalRevenue = cohorts.reduce((s, c) => s + c.revenue, 0);
    const totalSales = cohorts.reduce((s, c) => s + c.sales, 0);
    expect(totalLeads).toBe(3);
    expect(totalRevenue).toBe(400);
    expect(totalSales).toBe(1);
  });
});

describe('MetricsService — connection-date floor', () => {
  let tenantId = '';
  let adId = '';
  const CONNECT = d('2026-06-10'); // Meta + CRM connected this day; data before it must be ignored

  beforeAll(async () => {
    const tenant = await db.$base.tenant.create({ data: { name: 'floor-test', reportCurrency: 'USD' } });
    tenantId = tenant.id;
    const client = await db.$base.client.create({ data: { tenantId, name: 'c' } });
    const acc = await db.$base.adAccount.create({
      data: { tenantId, clientId: client.id, externalId: 'fact', currency: 'USD', timezone: 'UTC', tokenRef: 'x', createdAt: CONNECT },
    });
    await db.$base.crmConnection.create({
      data: { tenantId, clientId: client.id, provider: 'BITRIX24', externalRef: 'fp', authRef: 'x', createdAt: CONNECT },
    });
    const campaign = await db.$base.campaign.create({ data: { tenantId, adAccountId: acc.id, externalId: 'FC', name: 'Camp' } });
    const adSet = await db.$base.adSet.create({ data: { tenantId, campaignId: campaign.id, externalId: 'FS', name: 'Set' } });
    const ad = await db.$base.ad.create({ data: { tenantId, adSetId: adSet.id, externalId: 'FA', name: 'Ad' } });
    adId = ad.id;

    // spend before (06-05) and after (06-15) connection
    await db.$base.adInsightDaily.createMany({
      data: [
        { tenantId, adId: ad.id, date: d('2026-06-05'), spend: 100, currency: 'USD', impressions: 1000, clicks: 50 },
        { tenantId, adId: ad.id, date: d('2026-06-15'), spend: 30, currency: 'USD', impressions: 300, clicks: 10 },
      ],
    });

    // pre-connection contact (lead + won deal both created 06-05) — must NOT count
    const cPre = await db.$base.contact.create({ data: { tenantId, name: 'Pre' } });
    await db.$base.lead.create({ data: { tenantId, source: 'CRM', externalId: 'PreL', adId: ad.id, contactId: cPre.id, matchStatus: 'MATCHED', createdAt: d('2026-06-05') } });
    await db.$base.deal.create({ data: { tenantId, externalId: 'PreD', contactId: cPre.id, stageExternalId: 'won', canonical: 'WON', amount: 200, currency: 'USD', createdAt: d('2026-06-05') } });

    // post-connection contact (lead + won deal both created 06-15) — must count
    const cPost = await db.$base.contact.create({ data: { tenantId, name: 'Post' } });
    await db.$base.lead.create({ data: { tenantId, source: 'CRM', externalId: 'PostL', adId: ad.id, contactId: cPost.id, matchStatus: 'MATCHED', createdAt: d('2026-06-15') } });
    await db.$base.deal.create({ data: { tenantId, externalId: 'PostD', contactId: cPost.id, stageExternalId: 'won', canonical: 'WON', amount: 50, currency: 'USD', createdAt: d('2026-06-15') } });
  });

  afterAll(async () => {
    await db.$base.deal.deleteMany({ where: { tenantId } });
    await db.$base.lead.deleteMany({ where: { tenantId } });
    await db.$base.contact.deleteMany({ where: { tenantId } });
    await db.$base.crmConnection.deleteMany({ where: { tenantId } });
    await db.$base.client.deleteMany({ where: { tenantId } });
    await db.$base.tenant.delete({ where: { id: tenantId } });
  });

  const range = { from: '2026-06-01', to: '2026-06-30' };

  it('performance excludes pre-connection spend, leads and revenue', async () => {
    const { rows } = await service.performance(tenantId, range, 'LAST_TOUCH');
    const ad = rows.find((r) => r.id === adId)!;
    // only the 06-15 rows survive the connection floor (06-10)
    expect(ad).toMatchObject({ spend: 30, leads: 1, sales: 1, revenue: 50 });
  });

  it('cohorts exclude pre-connection rows', async () => {
    const { cohorts } = await service.cohorts(tenantId, range);
    expect(cohorts.reduce((s, c) => s + c.leads, 0)).toBe(1);
    expect(cohorts.reduce((s, c) => s + c.spend, 0)).toBe(30);
    expect(cohorts.reduce((s, c) => s + c.revenue, 0)).toBe(50);
  });
});
