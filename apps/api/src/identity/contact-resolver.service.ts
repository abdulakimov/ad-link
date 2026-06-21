import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type NormalizedIdentifier, normalizeIdentifiers } from '@adlink/core';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Finds or creates a canonical Contact from a person's identifiers, deduplicating
 * the same human across sources (PLAN §8). Identifier-based resolution also makes
 * ingestion idempotent. Returns null when there is no usable phone/email.
 */
@Injectable()
export class ContactResolver {
  constructor(@Inject(DB) private readonly db: Db) {}

  async resolve(
    tenantId: string,
    raw: { name?: string | null; phones?: string[]; emails?: string[] },
  ): Promise<string | null> {
    const ids = normalizeIdentifiers({ phones: raw.phones, emails: raw.emails });
    if (ids.length === 0) return null;

    for (const id of ids) {
      const found = await this.db.$base.contactIdentifier.findUnique({
        where: { tenantId_type_normalized: { tenantId, type: id.type, normalized: id.normalized } },
        select: { contactId: true },
      });
      if (found) {
        await this.attach(tenantId, found.contactId, ids);
        return found.contactId;
      }
    }

    const contact = await this.db.$base.contact.create({
      data: { tenantId, name: raw.name ?? null },
    });
    await this.attach(tenantId, contact.id, ids);
    return contact.id;
  }

  private async attach(tenantId: string, contactId: string, ids: NormalizedIdentifier[]) {
    for (const id of ids) {
      await this.db.$base.contactIdentifier.upsert({
        where: { tenantId_type_normalized: { tenantId, type: id.type, normalized: id.normalized } },
        create: { tenantId, contactId, type: id.type, normalized: id.normalized, hash: sha256(id.normalized) },
        update: {},
      });
    }
  }
}
