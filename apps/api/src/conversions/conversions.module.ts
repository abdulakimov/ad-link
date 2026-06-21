import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module.js';
import { ConversionsController } from './conversions.controller.js';
import { ConversionsService } from './conversions.service.js';

@Module({
  imports: [IngestModule],
  controllers: [ConversionsController],
  providers: [ConversionsService],
  exports: [ConversionsService],
})
export class ConversionsModule {}
