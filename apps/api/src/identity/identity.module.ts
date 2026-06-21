import { Global, Module } from '@nestjs/common';
import { ContactResolver } from './contact-resolver.service.js';

/** Contact resolution is shared by every ingestion path (CRM now, Meta leads in Phase 4). */
@Global()
@Module({
  providers: [ContactResolver],
  exports: [ContactResolver],
})
export class IdentityModule {}
