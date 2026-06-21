import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@adlink/core';

/** Per-request identity, set by AuthContextMiddleware and read by the Prisma
 *  tenant-scoping extension + RBAC. Background jobs run with no store (unscoped). */
export interface TenantStore {
  tenantId: string;
  userId: string;
  role: Role;
  clientId?: string | null;
}

export const tenantStore = new AsyncLocalStorage<TenantStore>();

export function currentStore(): TenantStore | undefined {
  return tenantStore.getStore();
}

/** Tenant id of the current request — for create() data where the type requires it. */
export function requireTenantId(): string {
  const s = tenantStore.getStore();
  if (!s?.tenantId) throw new Error('No tenant in context');
  return s.tenantId;
}
