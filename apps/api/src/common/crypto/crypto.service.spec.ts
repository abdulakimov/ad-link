import { beforeAll, describe, expect, it } from 'vitest';
import { CryptoService } from './crypto.service.js';
import { SecretsVault } from './secrets-vault.service.js';

describe('CryptoService', () => {
  let crypto: CryptoService;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    crypto = new CryptoService();
  });

  it('round-trips a secret', () => {
    const secret = 'meta-system-user-token-12345';
    expect(crypto.decrypt(crypto.encrypt(secret))).toBe(secret);
  });

  it('produces a fresh IV each time (ciphertexts differ)', () => {
    expect(crypto.encrypt('x')).not.toBe(crypto.encrypt('x'));
  });

  it('rejects tampered ciphertext (GCM auth)', () => {
    const enc = crypto.encrypt('secret');
    const tampered = `${enc.slice(0, -2)}xx`;
    expect(() => crypto.decrypt(tampered)).toThrow();
  });

  it('vault stores and retrieves via crypto', () => {
    const vault = new SecretsVault(crypto);
    expect(vault.retrieve(vault.store('token'))).toBe('token');
  });
});
