import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { JobsBootstrap } from './jobs.bootstrap.js';
import { MAINTENANCE_QUEUE, MaintenanceProcessor } from './maintenance.processor.js';
import { SyncRunService } from './sync-run.service.js';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          },
        };
      },
    }),
    BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
  ],
  providers: [MaintenanceProcessor, JobsBootstrap, SyncRunService],
  exports: [SyncRunService, BullModule],
})
export class JobsModule {}
