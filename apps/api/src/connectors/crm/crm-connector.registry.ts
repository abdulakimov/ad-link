import { Injectable } from '@nestjs/common';
import type { CrmConnector, CrmProvider } from '@adlink/core';
import { AmoConnector } from './amocrm.connector.js';
import { Bitrix24Connector } from './bitrix24.connector.js';

/** Resolves a CrmConnector by provider — the seam that makes new CRMs additive. */
@Injectable()
export class CrmConnectorRegistry {
  constructor(
    private readonly bitrix: Bitrix24Connector,
    private readonly amo: AmoConnector,
  ) {}

  resolve(provider: CrmProvider): CrmConnector {
    switch (provider) {
      case 'BITRIX24':
        return this.bitrix;
      case 'AMOCRM':
        return this.amo;
      default:
        throw new Error(`No CRM connector for provider ${provider}`);
    }
  }
}
