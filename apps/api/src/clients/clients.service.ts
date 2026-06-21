import { Inject, Injectable } from '@nestjs/common';
import { requireTenantId } from '../common/tenant/tenant-context.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

@Injectable()
export class ClientsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  list() {
    return this.db.client.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(name: string) {
    return this.db.client.create({ data: { tenantId: requireTenantId(), name } });
  }
}
