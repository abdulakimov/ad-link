import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Redis } from 'ioredis';
import { Public } from '../common/auth/public.decorator.js';
import { REDIS } from '../common/redis/redis.tokens.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness — the process is up. */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  /** Readiness — DB + Redis reachable. 503 if a dependency is down. */
  @Public()
  @Get('ready')
  async ready() {
    const [db, redis] = await Promise.all([
      this.check(() => this.db.$base.$queryRaw`SELECT 1`),
      this.check(() => this.redis.ping()),
    ]);
    if (!db || !redis) {
      throw new ServiceUnavailableException({ status: 'not-ready', db, redis });
    }
    return { status: 'ready', db, redis };
  }

  private async check(fn: () => Promise<unknown>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch {
      return false;
    }
  }
}
