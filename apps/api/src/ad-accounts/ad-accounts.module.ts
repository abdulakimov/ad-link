import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { IngestModule } from '../ingest/ingest.module.js';
import { AdAccountsController } from './ad-accounts.controller.js';
import { AdAccountsService } from './ad-accounts.service.js';

@Module({
  imports: [IngestModule, AuthModule],
  controllers: [AdAccountsController],
  providers: [AdAccountsService],
})
export class AdAccountsModule {}
