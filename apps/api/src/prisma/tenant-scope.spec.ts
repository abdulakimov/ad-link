import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantStore, type TenantStore } from '../common/tenant/tenant-context.js';
import { createPrismaClient } from './prisma.client.js';

// Integration test against the real database (DoD: prove cross-tenant isolation).
const db = createPrismaClient();
const asTenant = (tenantId: string) =>
  ({ tenantId, userId: 'test', role: 'OWNER' }) satisfies TenantStore;

describe('tenant scoping (Prisma extension)', () => {
  let tenantA = '';
  let tenantB = '';

  beforeAll(async () => {
    const a = await db.$base.tenant.create({ data: { name: 'A-scope-test' } });
    const b = await db.$base.tenant.create({ data: { name: 'B-scope-test' } });
    tenantA = a.id;
    tenantB = b.id;
    await db.$base.client.create({ data: { tenantId: tenantA, name: 'A client' } });
    await db.$base.client.create({ data: { tenantId: tenantB, name: 'B client' } });
  });

  afterAll(async () => {
    await db.$base.client.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await db.$base.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await db.$base.$disconnect();
  });

  it('findMany returns only the current tenant rows', async () => {
    const rows = await tenantStore.run(asTenant(tenantA), async () => db.client.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
  });

  it('cannot read another tenant even by asking for it explicitly', async () => {
    const rows = await tenantStore.run(asTenant(tenantA), async () =>
      db.client.findMany({ where: { tenantId: tenantB } }),
    );
    // the injected tenantId overrides the caller's → B leak is blocked
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
  });

  it('create injects the current tenant automatically', async () => {
    const created = await tenantStore.run(asTenant(tenantA), async () =>
      db.client.create({ data: { name: 'auto-scoped' } as { name: string; tenantId: string } }),
    );
    expect(created.tenantId).toBe(tenantA);
    await db.$base.client.delete({ where: { id: created.id } });
  });
});
