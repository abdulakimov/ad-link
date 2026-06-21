import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

/** AES-256-GCM authenticated encryption for credentials at rest (CLAUDE rule §3.4). */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const k = process.env.ENCRYPTION_KEY ?? '';
    if (Buffer.byteLength(k, 'utf8') !== 32) {
      throw new Error('ENCRYPTION_KEY must be exactly 32 bytes');
    }
    this.key = Buffer.from(k, 'utf8');
  }

  /** Returns `iv:tag:ciphertext`, all base64. */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const [ivB, tagB, dataB] = payload.split(':');
    if (!ivB || !tagB || !dataB) throw new Error('Malformed ciphertext');
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
