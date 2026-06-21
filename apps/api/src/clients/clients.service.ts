import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { requireTenantId } from '../common/tenant/tenant-context.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

@Injectable()
export class ClientsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  list() {
    return this.db.client.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(name: string) {
    // Reject duplicates within the tenant (the extension scopes this read to the tenant).
    const existing = await this.db.client.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('A client with this name already exists');
    return this.db.client.create({ data: { tenantId: requireTenantId(), name } });
  }

  async remove(id: string) {
    // findFirst is tenant-scoped, so this confirms ownership before deleting by id.
    const existing = await this.db.client.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');
    await this.db.client.delete({ where: { id } });
    return { ok: true };
  }
}
