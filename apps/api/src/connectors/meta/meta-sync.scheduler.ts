import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { META_SYNC_QUEUE } from './meta.processor.js';

const HOURLY_MS = 60 * 60 * 1000;

/**
 * Keeps campaign status/spend from drifting between manual "Sync now" clicks —
 * without this, toggling a campaign off in Meta Ads Manager wouldn't reach our DB
 * until someone happened to resync that account.
 */
@Injectable()
export class MetaSyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MetaSyncScheduler.name);

  constructor(@InjectQueue(META_SYNC_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      'meta-sync-all',
      { every: HOURLY_MS },
      { name: 'sync-all', data: {}, opts: { removeOnComplete: true, removeOnFail: 50 } },
    );
    this.logger.log('scheduled hourly meta-sync-all');
  }
}
