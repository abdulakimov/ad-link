import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MAINTENANCE_QUEUE } from './maintenance.processor.js';

/** Enqueues a startup ping so we can see the worker pipeline run (DoD: sample job). */
@Injectable()
export class JobsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsBootstrap.name);

  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    await this.queue.add(
      'ping',
      { at: new Date().toISOString() },
      { removeOnComplete: true, removeOnFail: 50 },
    );
    this.logger.log('enqueued startup maintenance ping');
  }
}
