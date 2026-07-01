import { randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../common/redis/redis.tokens.js';

/** Short-lived QR-login session: scan on phone, approve via Telegram/Google, auto-sign-in on desktop. */
const TTL_SECONDS = 300; // 5 minutes — matches the on-screen countdown
const redisKey = (qrId: string) => `qrlogin:${qrId}`;

/** Result of a provider login (Telegram bot or Google) to attach to an approved session. */
export interface IssuedAuth {
  token: string;
  user: unknown;
}

interface Session {
  status: 'pending' | 'approved';
  // browser-only secret: separates the public QR payload (qrId) from token retrieval,
  // so the phone (which only knows qrId) can never pull the desktop's JWT.
  secret: string;
  token?: string;
  user?: unknown;
}

@Injectable()
export class QrLoginService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Desktop opens a session: returns the qrId (goes into the QR) + a poll secret it keeps private. */
  async start() {
    const qrId = randomBytes(18).toString('base64url'); // 24 url-safe chars
    const secret = randomBytes(18).toString('base64url');
    const session: Session = { status: 'pending', secret };
    await this.redis.set(redisKey(qrId), JSON.stringify(session), 'EX', TTL_SECONDS);
    return { qrId, secret, expiresIn: TTL_SECONDS };
  }

  /** Desktop polls with its secret. Returns the JWT once approved (one-time delivery). */
  async status(qrId: string, secret: string) {
    const raw = await this.redis.get(redisKey(qrId));
    if (!raw) return { status: 'expired' as const };

    const session = JSON.parse(raw) as Session;
    if (session.secret !== secret) throw new UnauthorizedException('Invalid QR secret');

    if (session.status === 'approved') {
      await this.redis.del(redisKey(qrId)); // one-time: drop so the token can't be replayed
      return { status: 'approved' as const, token: session.token, user: session.user };
    }
    return { status: 'pending' as const };
  }

  /** Phone-side, no secret: lets the confirmation page show status + remaining time. Never returns the token. */
  async info(qrId: string) {
    const raw = await this.redis.get(redisKey(qrId));
    if (!raw) return { status: 'expired' as const, expiresIn: 0 };
    const session = JSON.parse(raw) as Session;
    const ttl = await this.redis.ttl(redisKey(qrId));
    return { status: session.status, expiresIn: ttl > 0 ? ttl : 0 };
  }

  /** Attach a provider login to the pending session so the desktop's next poll signs in. Idempotent. */
  async approve(qrId: string, auth: IssuedAuth): Promise<{ ok: boolean; reason?: string }> {
    const raw = await this.redis.get(redisKey(qrId));
    if (!raw) return { ok: false, reason: 'expired' };

    const session = JSON.parse(raw) as Session;
    if (session.status === 'approved') return { ok: true, reason: 'already' };

    const updated: Session = { ...session, status: 'approved', token: auth.token, user: auth.user };
    const ttl = await this.redis.ttl(redisKey(qrId)); // keep remaining TTL so it still expires
    await this.redis.set(redisKey(qrId), JSON.stringify(updated), 'EX', ttl > 0 ? ttl : TTL_SECONDS);
    return { ok: true };
  }
}
