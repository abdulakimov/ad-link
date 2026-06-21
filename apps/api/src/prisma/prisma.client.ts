import { PrismaClient } from '@adlink/db';
import { currentStore } from '../common/tenant/tenant-context.js';

/** Models carrying tenantId. Tenant (root) and FxRate (global) are excluded. */
const TENANT_SCOPED = new Set<string>([
  'User',
  'Client',
  'AdAccount',
  'CrmConnection',
  'StageMapping',
  'Campaign',
  'AdSet',
  'Ad',
  'Creative',
  'AdInsightDaily',
  'Contact',
  'ContactIdentifier',
  'Lead',
  'Deal',
  'TouchPoint',
  'ConversionEvent',
  'MatchAudit',
  'SyncRun',
]);

/** Read/bulk ops where we can safely inject a tenantId filter. */
const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * Defense-in-depth tenant scoping: when a request context exists, every query on
 * a tenant-scoped model is constrained to that tenant. Background jobs run with no
 * store and must pass tenantId explicitly. findUnique/upsert are NOT auto-scoped
 * (their where must be a unique selector) — services scope those by hand.
 */
export function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  const client = base.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ctx = currentStore();
          if (!ctx?.tenantId || !TENANT_SCOPED.has(model)) return query(args);

          const a = (args ?? {}) as Record<string, unknown>;
          if (WHERE_OPS.has(operation)) {
            a.where = { ...((a.where as object) ?? {}), tenantId: ctx.tenantId };
          } else if (operation === 'create') {
            a.data = { ...((a.data as object) ?? {}), tenantId: ctx.tenantId };
          } else if (operation === 'createMany') {
            const d = a.data;
            a.data = Array.isArray(d)
              ? d.map((x) => ({ ...(x as object), tenantId: ctx.tenantId }))
              : { ...((d as object) ?? {}), tenantId: ctx.tenantId };
          }
          return query(a as typeof args);
        },
      },
    },
  });

  // Keep a handle to the un-extended client for lifecycle ($connect/$disconnect).
  return Object.assign(client, { $base: base });
}

export type Db = ReturnType<typeof createPrismaClient>;
