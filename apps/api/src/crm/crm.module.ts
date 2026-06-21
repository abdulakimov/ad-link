import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

@Module({
  imports: [IngestModule],
  controllers: [CrmController],
  providers: [CrmService],
})
export class CrmModule {}
