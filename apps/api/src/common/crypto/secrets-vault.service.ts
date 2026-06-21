import { Injectable } from '@nestjs/common';
import { CryptoService } from './crypto.service.js';

/**
 * Starter secrets vault: the opaque "ref" stored in AdAccount.tokenRef /
 * CrmConnection.authRef IS the AES-GCM ciphertext. Swapping to a real KMS/Vault
 * later only changes this class — the ref becomes a key id, interface unchanged.
 * ponytail: encrypted ref now; KMS when a second env needs shared rotation.
 */
@Injectable()
export class SecretsVault {
  constructor(private readonly crypto: CryptoService) {}

  /** Encrypt a secret; the returned string is what you persist as the ref. */
  store(plaintext: string): string {
    return this.crypto.encrypt(plaintext);
  }

  /** Decrypt a ref back to the secret. Keep the plaintext in memory only. */
  retrieve(ref: string): string {
    return this.crypto.decrypt(ref);
  }
}
