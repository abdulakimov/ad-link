import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

export const MAINTENANCE_QUEUE = 'maintenance';

/** Baseline worker proving the BullMQ pipeline end-to-end. Real sync processors
 *  (Meta/CRM) follow the same WorkerHost pattern in later phases. */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  async process(job: Job): Promise<void> {
    if (job.name === 'ping') {
      this.logger.log(`maintenance ping ok @ ${String(job.data?.at ?? 'now')}`);
    }
  }
}
