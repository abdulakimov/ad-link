import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service.js';
import { SecretsVault } from './secrets-vault.service.js';

/** Crypto + secrets vault are needed by every connector → make them global. */
@Global()
@Module({
  providers: [CryptoService, SecretsVault],
  exports: [CryptoService, SecretsVault],
})
export class CryptoModule {}
