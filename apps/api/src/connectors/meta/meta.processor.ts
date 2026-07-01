import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { AdAccountRef } from '@adlink/core';
import type { Job, Queue } from 'bullmq';
import { SecretsVault } from '../../common/crypto/secrets-vault.service.js';
import { MetaSyncService } from '../../ingest/meta-sync.service.js';
import type { Db } from '../../prisma/prisma.client.js';
import { DB } from '../../prisma/prisma.tokens.js';
import { MetaConnector } from './meta.connector.js';

export const META_SYNC_QUEUE = 'meta-sync';

interface MetaSyncJob {
  adAccountId: string;
}

@Processor(META_SYNC_QUEUE)
export class MetaSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaSyncProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly vault: SecretsVault,
    private readonly sync: MetaSyncService,
    private readonly connector: MetaConnector,
    @InjectQueue(META_SYNC_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job<MetaSyncJob>): Promise<void> {
    if (job.name === 'sync-all') {
      await this.enqueueAllAccounts();
      return;
    }
    const acc = await this.db.$base.adAccount.findUnique({ where: { id: job.data.adAccountId } });
    if (!acc) {
      this.logger.warn(`meta-sync: ad account ${job.data.adAccountId} not found`);
      return;
    }
    const ref: AdAccountRef = {
      id: acc.id,
      provider: 'META',
      externalId: acc.externalId,
      token: this.vault.retrieve(acc.tokenRef),
      timezone: acc.timezone,
      currency: acc.currency,
    };
    await this.sync.sync(this.connector, ref, acc.tenantId, {
      trailingDays: 28,
      connectedAt: acc.createdAt,
    });
  }

  /** Fanned out from the hourly 'sync-all' scheduler — one 'sync' job per connected Meta account. */
  private async enqueueAllAccounts(): Promise<void> {
    const accounts = await this.db.$base.adAccount.findMany({
      where: { provider: 'META' },
      select: { id: true },
    });
    for (const acc of accounts) {
      await this.queue.add(
        'sync',
        { adAccountId: acc.id },
        { removeOnComplete: true, removeOnFail: 100 },
      );
    }
    this.logger.log(`meta-sync-all: enqueued ${accounts.length} account sync(s)`);
  }
}
