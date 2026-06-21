import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { CrmRef } from '@adlink/core';
import type { Job } from 'bullmq';
import { SecretsVault } from '../../common/crypto/secrets-vault.service.js';
import { CrmSyncService } from '../../ingest/crm-sync.service.js';
import type { Db } from '../../prisma/prisma.client.js';
import { DB } from '../../prisma/prisma.tokens.js';
import { CrmConnectorRegistry } from './crm-connector.registry.js';

export const CRM_SYNC_QUEUE = 'crm-sync';

interface CrmSyncJob {
  crmConnectionId: string;
}

/** Provider-agnostic: resolves the right connector from the connection's provider. */
@Processor(CRM_SYNC_QUEUE)
export class CrmSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CrmSyncProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly vault: SecretsVault,
    private readonly sync: CrmSyncService,
    private readonly registry: CrmConnectorRegistry,
  ) {
    super();
  }

  async process(job: Job<CrmSyncJob>): Promise<void> {
    const conn = await this.db.$base.crmConnection.findUnique({
      where: { id: job.data.crmConnectionId },
    });
    if (!conn) {
      this.logger.warn(`crm-sync: connection ${job.data.crmConnectionId} not found`);
      return;
    }
    const ref: CrmRef = {
      id: conn.id,
      provider: conn.provider,
      externalRef: conn.externalRef,
      auth: this.vault.retrieve(conn.authRef),
    };
    await this.sync.sync(this.registry.resolve(conn.provider), ref, conn.tenantId);
  }
}
