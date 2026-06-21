import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CrmConnection } from '@adlink/db';
import { Queue } from 'bullmq';
import { ensureDefaultClient } from '../clients/default-client.js';
import { SecretsVault } from '../common/crypto/secrets-vault.service.js';
import { requireTenantId } from '../common/tenant/tenant-context.js';
import { CrmConnectorRegistry } from '../connectors/crm/crm-connector.registry.js';
import { CRM_SYNC_QUEUE } from '../connectors/crm/crm-sync.processor.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';
import type { ConnectAmocrmDto } from './dto/connect-amocrm.dto.js';
import type { ConnectBitrixDto } from './dto/connect-bitrix.dto.js';
import type { SetMappingsDto } from './dto/set-mappings.dto.js';

@Injectable()
export class CrmService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly vault: SecretsVault,
    private readonly registry: CrmConnectorRegistry,
    @InjectQueue(CRM_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  async connectBitrix(dto: ConnectBitrixDto) {
    const clientId = dto.clientId ?? (await ensureDefaultClient(this.db));
    const created = await this.db.crmConnection.create({
      data: {
        tenantId: requireTenantId(),
        clientId,
        provider: 'BITRIX24',
        externalRef: dto.portal,
        authRef: this.vault.store(dto.webhookUrl),
      },
    });
    return this.safe(created);
  }

  async connectAmocrm(dto: ConnectAmocrmDto) {
    const clientId = dto.clientId ?? (await ensureDefaultClient(this.db));
    const created = await this.db.crmConnection.create({
      data: {
        tenantId: requireTenantId(),
        clientId,
        provider: 'AMOCRM',
        externalRef: dto.baseUrl,
        authRef: this.vault.store(dto.accessToken),
      },
    });
    return this.safe(created);
  }

  async list() {
    const rows = await this.db.crmConnection.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.safe(r));
  }

  async remove(id: string) {
    await this.requireConn(id); // tenant-scoped ownership check
    await this.db.$base.crmConnection.delete({ where: { id } });
    return { ok: true };
  }

  /** Live stages from the CRM, for the mapping UI. */
  async stages(id: string) {
    const conn = await this.requireConn(id);
    return this.registry.resolve(conn.provider).fetchStages({
      id: conn.id,
      provider: conn.provider,
      externalRef: conn.externalRef,
      auth: this.vault.retrieve(conn.authRef),
    });
  }

  async getMappings(id: string) {
    await this.requireConn(id);
    return this.db.stageMapping.findMany({ where: { crmConnectionId: id } });
  }

  /** Upsert mappings — remap any stage without losing data. */
  async setMappings(id: string, dto: SetMappingsDto) {
    const conn = await this.requireConn(id);
    for (const m of dto.mappings) {
      await this.db.$base.stageMapping.upsert({
        where: { crmConnectionId_externalStageId: { crmConnectionId: id, externalStageId: m.externalStageId } },
        create: {
          tenantId: conn.tenantId,
          crmConnectionId: id,
          externalStageId: m.externalStageId,
          externalStageName: m.externalStageName,
          canonical: m.canonical,
        },
        update: { externalStageName: m.externalStageName, canonical: m.canonical },
      });
    }
    return this.getMappings(id);
  }

  async triggerSync(id: string) {
    const conn = await this.requireConn(id);
    await this.queue.add('sync', { crmConnectionId: conn.id }, { removeOnComplete: true, removeOnFail: 100 });
    return { enqueued: true, crmConnectionId: conn.id };
  }

  private async requireConn(id: string): Promise<CrmConnection> {
    const conn = await this.db.crmConnection.findFirst({ where: { id } });
    if (!conn) throw new NotFoundException('CRM connection not found');
    return conn;
  }

  private safe(c: CrmConnection) {
    return {
      id: c.id,
      clientId: c.clientId,
      provider: c.provider,
      externalRef: c.externalRef,
      revenueField: c.revenueField,
      lastSyncAt: c.lastSyncAt,
      syncState: c.syncState,
    };
  }
}
