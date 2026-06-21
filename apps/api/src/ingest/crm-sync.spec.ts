import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CrmConnector, CrmRef } from '@adlink/core';
import { ContactResolver } from '../identity/contact-resolver.service.js';
import { SyncRunService } from '../jobs/sync-run.service.js';
import { createPrismaClient } from '../prisma/prisma.client.js';
import { CrmSyncService } from './crm-sync.service.js';

const db = createPrismaClient();
const service = new CrmSyncService(db, new SyncRunService(db), new ContactResolver(db));

const fake: CrmConnector = {
  fetchStages: async () => [
    { externalId: 'WON', name: 'Won' },
    { externalId: 'QUAL', name: 'Qualified' },
  ],
  fetchContacts: async () => [
    { externalId: 'k1', name: 'Ali', phones: ['+998901112233'], emails: ['ali@x.com'] },
  ],
  fetchLeads: async () => [
    {
      source: 'CRM',
      externalId: 'L1',
      name: 'Ali',
      phones: ['+998901112233'],
      createdAt: '2026-06-01T00:00:00Z',
    },
  ],
  fetchDeals: async () => [
    { externalId: 'D1', contactExternalId: 'k1', stageExternalId: 'WON', amount: 500, currency: 'UZS', createdAt: '2026-06-01T00:00:00Z', wonAt: '2026-06-05T00:00:00Z' },
    { externalId: 'D2', contactExternalId: 'k1', stageExternalId: 'QUAL', amount: 0, currency: 'UZS', createdAt: '2026-06-02T00:00:00Z' },
    { externalId: 'D3', stageExternalId: 'UNKNOWN', createdAt: '2026-06-03T00:00:00Z' },
  ],
};

describe('CrmSyncService', () => {
  let tenantId = '';
  let connId = '';

  beforeAll(async () => {
    const tenant = await db.$base.tenant.create({ data: { name: 'crm-sync-test' } });
    tenantId = tenant.id;
    const client = await db.$base.client.create({ data: { tenantId, name: 'c' } });
    const conn = await db.$base.crmConnection.create({
      data: { tenantId, clientId: client.id, provider: 'BITRIX24', externalRef: 'portal', authRef: 'x' },
    });
    connId = conn.id;
    await db.$base.stageMapping.createMany({
      data: [
        { tenantId, crmConnectionId: connId, externalStageId: 'WON', externalStageName: 'Won', canonical: 'WON' },
        { tenantId, crmConnectionId: connId, externalStageId: 'QUAL', externalStageName: 'Qualified', canonical: 'QUALIFIED' },
      ],
    });
  });

  afterAll(async () => {
    await db.$base.deal.deleteMany({ where: { tenantId } });
    await db.$base.lead.deleteMany({ where: { tenantId } });
    await db.$base.contactIdentifier.deleteMany({ where: { tenantId } });
    await db.$base.contact.deleteMany({ where: { tenantId } });
    await db.$base.client.deleteMany({ where: { tenantId } });
    await db.$base.syncRun.deleteMany({ where: { tenantId } });
    await db.$base.tenant.delete({ where: { id: tenantId } });
    await db.$base.$disconnect();
  });

  const ref = (): CrmRef => ({ id: connId, provider: 'BITRIX24', externalRef: 'portal', auth: 'x' });

  it('maps stages to canonical status and dedups the contact', async () => {
    await service.sync(fake, ref(), tenantId);

    const deals = await db.$base.deal.findMany({ where: { tenantId }, orderBy: { externalId: 'asc' } });
    expect(deals.map((d) => [d.externalId, d.canonical])).toEqual([
      ['D1', 'WON'],
      ['D2', 'QUALIFIED'],
      ['D3', 'LEAD'], // unmapped stage falls back to LEAD
    ]);
    expect(deals.find((d) => d.externalId === 'D1')?.contactId).toBeTruthy();
    // lead + contact are the same person → one Contact
    expect(await db.$base.contact.count({ where: { tenantId } })).toBe(1);
  });

  it('is idempotent', async () => {
    await service.sync(fake, ref(), tenantId);
    expect(await db.$base.deal.count({ where: { tenantId } })).toBe(3);
    expect(await db.$base.contact.count({ where: { tenantId } })).toBe(1);
    expect(await db.$base.lead.count({ where: { tenantId } })).toBe(1);
  });
});
