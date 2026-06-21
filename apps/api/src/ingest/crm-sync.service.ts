import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CrmConnector, CrmRef, RawDeal, RawLead } from '@adlink/core';
import { CanonicalStatus } from '@adlink/db';
import { ContactResolver } from '../identity/contact-resolver.service.js';
import { SyncRunService } from '../jobs/sync-run.service.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

/**
 * Pulls a CRM into canonical Contacts/Leads/Deals. Each deal's stage is mapped to
 * a canonical status via the tenant's StageMapping config (PLAN §6.2). Idempotent:
 * deals upsert on (tenant, externalId); contacts dedup by identifier.
 */
@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly syncRun: SyncRunService,
    private readonly contacts: ContactResolver,
  ) {}

  async sync(connector: CrmConnector, conn: CrmRef, tenantId: string, since = new Date(0)) {
    const run = await this.syncRun.start(tenantId, 'crm_sync');
    try {
      const mappings = await this.loadMappings(conn.id);

      const rawContacts = await connector.fetchContacts(conn, since);
      const contactByExternal = new Map<string, string>();
      for (const c of rawContacts) {
        const id = await this.contacts.resolve(tenantId, c);
        if (id) contactByExternal.set(c.externalId, id);
      }

      const rawLeads = await connector.fetchLeads(conn, since);
      for (const l of rawLeads) await this.upsertLead(tenantId, l);

      const rawDeals = await connector.fetchDeals(conn, since);
      for (const d of rawDeals) {
        const canonical = mappings.get(d.stageExternalId) ?? CanonicalStatus.LEAD;
        const contactId = d.contactExternalId
          ? (contactByExternal.get(d.contactExternalId) ?? null)
          : null;
        await this.upsertDeal(tenantId, d, canonical, contactId);
      }

      await this.db.$base.crmConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: new Date(), syncState: 'OK' },
      });
      await this.syncRun.finish(run.id, 'OK');
      this.logger.log(`crm sync ok: ${rawDeals.length} deals, ${rawLeads.length} leads`);
    } catch (err) {
      await this.syncRun.finish(run.id, 'FAILED', err instanceof Error ? err.message : String(err));
      await this.db.$base.crmConnection
        .update({ where: { id: conn.id }, data: { syncState: 'FAILED' } })
        .catch(() => undefined);
      throw err;
    }
  }

  private async loadMappings(crmConnectionId: string): Promise<Map<string, CanonicalStatus>> {
    const rows = await this.db.$base.stageMapping.findMany({
      where: { crmConnectionId },
      select: { externalStageId: true, canonical: true },
    });
    return new Map(rows.map((r) => [r.externalStageId, r.canonical]));
  }

  private async upsertLead(tenantId: string, l: RawLead) {
    if (!l.externalId) return;
    const contactId = await this.contacts.resolve(tenantId, l);
    await this.db.$base.lead.upsert({
      where: { tenantId_source_externalId: { tenantId, source: l.source, externalId: l.externalId } },
      create: {
        tenantId,
        source: l.source,
        externalId: l.externalId,
        contactId,
        createdAt: new Date(l.createdAt),
      },
      update: { contactId },
    });
  }

  private async upsertDeal(
    tenantId: string,
    d: RawDeal,
    canonical: CanonicalStatus,
    contactId: string | null,
  ) {
    const data = {
      stageExternalId: d.stageExternalId,
      canonical,
      amount: d.amount ?? null,
      currency: d.currency ?? null,
      createdAt: new Date(d.createdAt),
      wonAt: d.wonAt ? new Date(d.wonAt) : null,
      contactId,
    };
    await this.db.$base.deal.upsert({
      where: { tenantId_externalId: { tenantId, externalId: d.externalId } },
      create: { tenantId, externalId: d.externalId, ...data },
      update: data,
    });
  }
}
