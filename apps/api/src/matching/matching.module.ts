import { Global, Module } from '@nestjs/common';
import { CaptureService } from './capture.service.js';
import { MatchingController } from './matching.controller.js';
import { MatchingService } from './matching.service.js';

/** Global so sync pipelines can run matching after ingest. */
@Global()
@Module({
  controllers: [MatchingController],
  providers: [MatchingService, CaptureService],
  exports: [MatchingService],
})
export class MatchingModule {}
