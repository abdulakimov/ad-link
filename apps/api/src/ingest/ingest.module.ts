import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AmoConnector } from '../connectors/crm/amocrm.connector.js';
import { Bitrix24Connector } from '../connectors/crm/bitrix24.connector.js';
import { CrmConnectorRegistry } from '../connectors/crm/crm-connector.registry.js';
import { CRM_SYNC_QUEUE, CrmSyncProcessor } from '../connectors/crm/crm-sync.processor.js';
import { MetaConnector } from '../connectors/meta/meta.connector.js';
import { META_SYNC_QUEUE, MetaSyncProcessor } from '../connectors/meta/meta.processor.js';
import { CrmSyncService } from './crm-sync.service.js';
import { MetaSyncService } from './meta-sync.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: META_SYNC_QUEUE }, { name: CRM_SYNC_QUEUE })],
  providers: [
    MetaConnector,
    MetaSyncService,
    MetaSyncProcessor,
    Bitrix24Connector,
    AmoConnector,
    CrmConnectorRegistry,
    CrmSyncService,
    CrmSyncProcessor,
  ],
  exports: [MetaSyncService, CrmSyncService, MetaConnector, CrmConnectorRegistry, BullModule],
})
export class IngestModule {}
