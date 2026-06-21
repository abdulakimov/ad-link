import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AdAccount } from '@adlink/db';
import { Queue } from 'bullmq';
import { SecretsVault } from '../common/crypto/secrets-vault.service.js';
import { requireTenantId } from '../common/tenant/tenant-context.js';
import { META_SYNC_QUEUE } from '../connectors/meta/meta.processor.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';
import type { ConnectMetaDto } from './dto/connect-meta.dto.js';

/** Queries below run inside the request's tenant context → auto-scoped. */
@Injectable()
export class AdAccountsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly vault: SecretsVault,
    @InjectQueue(META_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  async connectMeta(dto: ConnectMetaDto) {
    const client = await this.db.client.findFirst({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Client not found');

    const created = await this.db.adAccount.create({
      data: {
        tenantId: requireTenantId(),
        clientId: dto.clientId,
        provider: 'META',
        externalId: dto.externalId,
        name: dto.name,
        currency: dto.currency,
        timezone: dto.timezone,
        tokenRef: this.vault.store(dto.token), // encrypted at rest
      },
    });
    return this.safe(created);
  }

  async list() {
    const accounts = await this.db.adAccount.findMany({ orderBy: { createdAt: 'desc' } });
    return accounts.map((a) => this.safe(a));
  }

  /** Opt this ad account in/out of the Meta feedback loop (PLAN §6.3). */
  async setFeedback(id: string, optIn: boolean) {
    const acc = await this.db.adAccount.findFirst({ where: { id } });
    if (!acc) throw new NotFoundException('Ad account not found');
    return this.safe(
      await this.db.$base.adAccount.update({ where: { id }, data: { feedbackOptIn: optIn } }),
    );
  }

  async triggerSync(id: string) {
    const acc = await this.db.adAccount.findFirst({ where: { id } });
    if (!acc) throw new NotFoundException('Ad account not found');
    await this.queue.add('sync', { adAccountId: acc.id }, { removeOnComplete: true, removeOnFail: 100 });
    return { enqueued: true, adAccountId: acc.id };
  }

  /** Never expose the token ref to the frontend. */
  private safe(a: AdAccount) {
    return {
      id: a.id,
      clientId: a.clientId,
      provider: a.provider,
      externalId: a.externalId,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone,
      feedbackOptIn: a.feedbackOptIn,
      lastSyncAt: a.lastSyncAt,
      syncState: a.syncState,
    };
  }
}
