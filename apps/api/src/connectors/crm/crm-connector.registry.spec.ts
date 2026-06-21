import { describe, expect, it } from 'vitest';
import { AmoConnector } from './amocrm.connector.js';
import { Bitrix24Connector } from './bitrix24.connector.js';
import { CrmConnectorRegistry } from './crm-connector.registry.js';

describe('CrmConnectorRegistry', () => {
  const registry = new CrmConnectorRegistry(new Bitrix24Connector(), new AmoConnector());

  it('resolves a connector per provider', () => {
    expect(registry.resolve('BITRIX24')).toBeInstanceOf(Bitrix24Connector);
    expect(registry.resolve('AMOCRM')).toBeInstanceOf(AmoConnector);
  });

  it('throws for an unsupported provider', () => {
    expect(() => registry.resolve('HUBSPOT')).toThrow();
  });

  it('amoCRM models the inquiry as a deal (no separate lead entity)', async () => {
    expect(await new AmoConnector().fetchLeads()).toEqual([]);
  });
});
