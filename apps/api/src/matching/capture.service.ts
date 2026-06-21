import { Inject, Injectable } from '@nestjs/common';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';
import type { CaptureDto } from './dto/capture.dto.js';

/**
 * Landing-page click beacon. Records a CLICK touchpoint so a later CRM lead carrying
 * the same ad tag resolves deterministically (PLAN §10).
 * ponytail: trusts the posted tenantId; add a signed tenant key + rate limit in Phase 11.
 */
@Injectable()
export class CaptureService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(dto: CaptureDto) {
    const externalId = dto.adExternalId ?? dto.utmContent;
    if (!externalId) return { recorded: false };

    const ad = await this.db.$base.ad.findFirst({
      where: { tenantId: dto.tenantId, externalId },
      select: { id: true },
    });
    if (!ad) return { recorded: false };

    await this.db.$base.touchPoint.create({
      data: { tenantId: dto.tenantId, adId: ad.id, type: 'CLICK', occurredAt: new Date() },
    });
    return { recorded: true };
  }
}
