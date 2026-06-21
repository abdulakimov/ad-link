import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import type { Db } from '../prisma/prisma.client.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('liveness returns ok without touching dependencies', () => {
    const controller = new HealthController({} as Db, {} as Redis);
    expect(controller.health().status).toBe('ok');
  });

  it('readiness reports ready when DB + Redis respond', async () => {
    const db = { $base: { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) } } as unknown as Db;
    const redis = { ping: vi.fn().mockResolvedValue('PONG') } as unknown as Redis;
    const controller = new HealthController(db, redis);
    await expect(controller.ready()).resolves.toMatchObject({ status: 'ready', db: true, redis: true });
  });

  it('readiness throws 503 when a dependency is down', async () => {
    const db = { $base: { $queryRaw: vi.fn().mockRejectedValue(new Error('down')) } } as unknown as Db;
    const redis = { ping: vi.fn().mockResolvedValue('PONG') } as unknown as Redis;
    const controller = new HealthController(db, redis);
    await expect(controller.ready()).rejects.toThrow();
  });
});
