import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdConnector } from '@adlink/core';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { SecretsVault } from '../common/crypto/secrets-vault.service.js';
import { createPrismaClient } from '../prisma/prisma.client.js';
import { ConversionsService } from './conversions.service.js';

const db = createPrismaClient();
const vault = new SecretsVault(new CryptoService());
// MetaConnector is unused (we pass a fake to push); cast for the constructor.
const service = new ConversionsService(db, vault, {} as never);

const fakeConnector: AdConnector = {
  fetchAdHierarchy: async () => ({ campaigns: [] }),
  fetchInsights: async () => [],
  pushConversion: async () => ({ accepted: true, raw: { events_received: 1 } }),
};

describe('ConversionsService', () => {
  let tenantId = '';

  beforeAll(async () => {
    const tenant = await db.$base.tenant.create({ data: { name: 'conv-test' } });
    tenantId = tenant.id;
    const client = await db.$base.client.create({ data: { tenantId, name: 'c' } });

    // opt-in account with a won + qualified person
    const acc = await db.$base.adAccount.create({
      data: { tenantId, clientId: client.id, externalId: 'act_in', currency: 'USD', timezone: 'UTC', tokenRef: vault.store('tok'), feedbackOptIn: true },
    });
    const camp = await db.$base.campaign.create({ data: { tenantId, adAccountId: acc.id, externalId: 'C1', name: 'C' } });
    const set = await db.$base.adSet.create({ data: { tenantId, campaignId: camp.id, externalId: 'S1', name: 'S' } });
    const ad = await db.$base.ad.create({ data: { tenantId, adSetId: set.id, externalId: 'A1', name: 'Ad' } });

    const c1 = await db.$base.contact.create({ data: { tenantId, name: 'Won' } });
    await db.$base.contactIdentifier.create({ data: { tenantId, contactId: c1.id, type: 'PHONE', normalized: '+998901112233', hash: 'hashed' } });
    const c2 = await db.$base.contact.create({ data: { tenantId, name: 'Qual' } });
    await db.$base.lead.create({ data: { tenantId, source: 'META_LEAD_AD', externalId: 'L1', leadgenId: 'lg1', adId: ad.id, contactId: c1.id, matchStatus: 'MATCHED', createdAt: new Date() } });
    await db.$base.lead.create({ data: { tenantId, source: 'CRM', externalId: 'L2', adId: ad.id, contactId: c2.id, matchStatus: 'MATCHED', createdAt: new Date() } });
    await db.$base.deal.create({ data: { tenantId, externalId: 'D1', contactId: c1.id, stageExternalId: 'won', canonical: 'WON', amount: 300, currency: 'USD', createdAt: new Date() } });
    await db.$base.deal.create({ data: { tenantId, externalId: 'D2', contactId: c2.id, stageExternalId: 'q', canonical: 'QUALIFIED', amount: 0, currency: 'USD', createdAt: new Date() } });

    // opt-OUT account with a won person → must NOT generate events
    const acc2 = await db.$base.adAccount.create({
      data: { tenantId, clientId: client.id, externalId: 'act_out', currency: 'USD', timezone: 'UTC', tokenRef: vault.store('tok'), feedbackOptIn: false },
    });
    const camp2 = await db.$base.campaign.create({ data: { tenantId, adAccountId: acc2.id, externalId: 'C2', name: 'C2' } });
    const set2 = await db.$base.adSet.create({ data: { tenantId, campaignId: camp2.id, externalId: 'S2', name: 'S2' } });
    const ad2 = await db.$base.ad.create({ data: { tenantId, adSetId: set2.id, externalId: 'A2', name: 'Ad2' } });
    const c3 = await db.$base.contact.create({ data: { tenantId, name: 'OutWon' } });
    await db.$base.lead.create({ data: { tenantId, source: 'CRM', externalId: 'L3', adId: ad2.id, contactId: c3.id, matchStatus: 'MATCHED', createdAt: new Date() } });
    await db.$base.deal.create({ data: { tenantId, externalId: 'D3', contactId: c3.id, stageExternalId: 'won', canonical: 'WON', amount: 999, currency: 'USD', createdAt: new Date() } });
  });

  afterAll(async () => {
    await db.$base.conversionEvent.deleteMany({ where: { tenantId } });
    await db.$base.deal.deleteMany({ where: { tenantId } });
    await db.$base.lead.deleteMany({ where: { tenantId } });
    await db.$base.contactIdentifier.deleteMany({ where: { tenantId } });
    await db.$base.contact.deleteMany({ where: { tenantId } });
    await db.$base.client.deleteMany({ where: { tenantId } });
    await db.$base.tenant.delete({ where: { id: tenantId } });
    await db.$base.$disconnect();
  });

  it('generates QL + Purchase only for opt-in accounts, idempotently', async () => {
    const first = await service.generate(tenantId);
    expect(first.created).toBe(3); // QL(c1) + QL(c2) + Purchase(D1)

    const events = await db.$base.conversionEvent.findMany({ where: { tenantId } });
    expect(events.filter((e) => e.type === 'QUALIFIED_LEAD')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'PURCHASE')).toHaveLength(1);
    // the opt-out account's won deal produced nothing
    expect(events.some((e) => e.eventId === 'PUR:D3')).toBe(false);

    const again = await service.generate(tenantId);
    expect(again.created).toBe(0); // idempotent
  });

  it('pushes pending events and records the verdict', async () => {
    const res = await service.push(tenantId, fakeConnector);
    expect(res.accepted).toBe(3);
    expect(res.rejected).toBe(0);
    const remaining = await db.$base.conversionEvent.count({ where: { tenantId, state: 'PENDING' } });
    expect(remaining).toBe(0);
  });
});
