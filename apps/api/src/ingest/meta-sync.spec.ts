import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdAccountRef, AdConnector } from '@adlink/core';
import { SyncRunService } from '../jobs/sync-run.service.js';
import { createPrismaClient } from '../prisma/prisma.client.js';
import { MetaSyncService } from './meta-sync.service.js';

const db = createPrismaClient();
const service = new MetaSyncService(db, new SyncRunService(db));

const fakeConnector: AdConnector = {
  fetchAdHierarchy: async () => ({
    campaigns: [
      {
        externalId: 'c1',
        name: 'Campaign 1',
        status: 'ACTIVE',
        adSets: [
          {
            externalId: 's1',
            name: 'Ad set 1',
            status: 'ACTIVE',
            ads: [
              { externalId: 'a1', name: 'Ad 1', creativeExternalId: 'cr1', creativeName: 'Vid1-h2-c3' },
              { externalId: 'a2', name: 'Ad 2', creativeExternalId: 'cr2', creativeName: 'Vid2-h1-c1' },
            ],
          },
        ],
      },
    ],
  }),
  fetchInsights: async () => [
    { adExternalId: 'a1', date: '2026-06-01', spend: 10, currency: 'USD', impressions: 100, clicks: 5 },
    { adExternalId: 'a2', date: '2026-06-01', spend: 20, currency: 'USD', impressions: 200, clicks: 8 },
  ],
};

describe('MetaSyncService', () => {
  let tenantId = '';
  let acc: AdAccountRef;

  beforeAll(async () => {
    const tenant = await db.$base.tenant.create({ data: { name: 'meta-sync-test' } });
    tenantId = tenant.id;
    const client = await db.$base.client.create({ data: { tenantId, name: 'c' } });
    const adAccount = await db.$base.adAccount.create({
      data: {
        tenantId,
        clientId: client.id,
        externalId: 'act_test_1',
        currency: 'USD',
        timezone: 'UTC',
        tokenRef: 'unused',
      },
    });
    acc = {
      id: adAccount.id,
      provider: 'META',
      externalId: 'act_test_1',
      token: 'x',
      timezone: 'UTC',
      currency: 'USD',
    };
  });

  afterAll(async () => {
    await db.$base.client.deleteMany({ where: { tenantId } });
    await db.$base.creative.deleteMany({ where: { tenantId } });
    await db.$base.syncRun.deleteMany({ where: { tenantId } });
    await db.$base.tenant.delete({ where: { id: tenantId } });
    await db.$base.$disconnect();
  });

  it('ingests hierarchy + insights and parses creatives', async () => {
    await service.sync(fakeConnector, acc, tenantId);

    expect(await db.$base.campaign.count({ where: { adAccountId: acc.id } })).toBe(1);
    expect(await db.$base.adSet.count({ where: { tenantId } })).toBe(1);
    expect(await db.$base.ad.count({ where: { tenantId } })).toBe(2);
    expect(await db.$base.adInsightDaily.count({ where: { tenantId } })).toBe(2);

    const cr1 = await db.$base.creative.findFirst({ where: { tenantId, externalId: 'cr1' } });
    expect(cr1).toMatchObject({ video: '1', hook: '2', concept: '3' });
  });

  it('is idempotent — re-running does not duplicate rows', async () => {
    await service.sync(fakeConnector, acc, tenantId);
    expect(await db.$base.ad.count({ where: { tenantId } })).toBe(2);
    expect(await db.$base.adInsightDaily.count({ where: { tenantId } })).toBe(2);
    expect(await db.$base.creative.count({ where: { tenantId } })).toBe(2);
  });
});
