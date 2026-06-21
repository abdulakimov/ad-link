import { Inject, Injectable } from '@nestjs/common';
import { SyncState } from '@adlink/db';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

/** Records every sync attempt so the UI can show data freshness + failures (PLAN §5). */
@Injectable()
export class SyncRunService {
  constructor(@Inject(DB) private readonly db: Db) {}

  start(tenantId: string, kind: string, window?: { start?: Date; end?: Date }) {
    return this.db.syncRun.create({
      data: {
        tenantId,
        kind,
        state: SyncState.RUNNING,
        windowStart: window?.start ?? null,
        windowEnd: window?.end ?? null,
      },
    });
  }

  finish(id: string, state: 'OK' | 'FAILED', error?: string) {
    return this.db.syncRun.update({
      where: { id },
      data: { state, error: error ?? null, finishedAt: new Date() },
    });
  }
}
