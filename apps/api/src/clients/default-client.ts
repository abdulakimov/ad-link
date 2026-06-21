import { requireTenantId } from '../common/tenant/tenant-context.js';
import type { Db } from '../prisma/prisma.client.js';

/**
 * Resolve the client a connection attaches to. Clients are no longer managed by hand —
 * connections separate by ad account, so we keep one implicit default client per tenant.
 */
export async function ensureDefaultClient(db: Db): Promise<string> {
  const existing = await db.client.findFirst({ orderBy: { createdAt: 'asc' } });
  if (existing) return existing.id;
  const created = await db.client.create({ data: { tenantId: requireTenantId(), name: 'Default' } });
  return created.id;
}
