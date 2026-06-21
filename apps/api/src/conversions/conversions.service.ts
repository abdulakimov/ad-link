import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AdConnector, ConversionType } from '@adlink/core';
import { Prisma } from '@adlink/db';
import { SecretsVault } from '../common/crypto/secrets-vault.service.js';
import { MetaConnector } from '../connectors/meta/meta.connector.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

/**
 * The feedback loop (PLAN §6.3): turn CRM outcomes into QualifiedLead + Purchase events
 * and report them back to Meta for opt-in ad accounts. Generation is idempotent (stable
 * eventId per outcome); pushes are fully audited (sent / accepted / rejected).
 */
@Injectable()
export class ConversionsService {
  private readonly logger = new Logger(ConversionsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly vault: SecretsVault,
    private readonly connector: MetaConnector,
  ) {}

  /** Materialize pending ConversionEvents from qualified leads + won deals. */
  async generate(tenantId: string): Promise<{ created: number }> {
    const optIn = await this.db.$base.adAccount.findMany({
      where: { tenantId, feedbackOptIn: true },
      select: { id: true },
    });
    if (optIn.length === 0) return { created: 0 };
    const accIds = optIn.map((a) => a.id);

    const ads = await this.db.$base.ad.findMany({
      where: { tenantId, adSet: { campaign: { adAccountId: { in: accIds } } } },
      select: { id: true, adSet: { select: { campaign: { select: { adAccountId: true } } } } },
    });
    const accountByAd = new Map(ads.map((a) => [a.id, a.adSet.campaign.adAccountId]));
    const adIds = [...accountByAd.keys()];
    if (adIds.length === 0) return { created: 0 };

    // last-touch lead per contact (among opt-in ads)
    const leads = await this.db.$base.lead.findMany({
      where: { tenantId, adId: { in: adIds }, matchStatus: 'MATCHED', contactId: { not: null } },
      select: { id: true, adId: true, leadgenId: true, contactId: true },
      orderBy: { createdAt: 'asc' },
    });
    const contactLead = new Map<string, { leadId: string; adId: string; leadgenId: string | null }>();
    for (const l of leads) {
      contactLead.set(l.contactId!, { leadId: l.id, adId: l.adId!, leadgenId: l.leadgenId });
    }

    const contactIds = [...contactLead.keys()];
    const deals = contactIds.length
      ? await this.db.$base.deal.findMany({
          where: { tenantId, contactId: { in: contactIds } },
          select: { id: true, contactId: true, canonical: true, amount: true, currency: true },
        })
      : [];

    let created = 0;
    const qualifiedContacts = new Set(
      deals.filter((d) => d.canonical === 'QUALIFIED' || d.canonical === 'WON').map((d) => d.contactId!),
    );
    for (const contactId of qualifiedContacts) {
      const cl = contactLead.get(contactId);
      if (!cl) continue;
      if (await this.createEvent(tenantId, accountByAd.get(cl.adId)!, 'QUALIFIED_LEAD', `QL:${cl.leadId}`, { leadgenId: cl.leadgenId })) {
        created++;
      }
    }
    for (const d of deals.filter((x) => x.canonical === 'WON')) {
      const cl = contactLead.get(d.contactId!);
      if (!cl) continue;
      if (
        await this.createEvent(tenantId, accountByAd.get(cl.adId)!, 'PURCHASE', `PUR:${d.id}`, {
          leadgenId: cl.leadgenId,
          value: Number(d.amount ?? 0),
          currency: d.currency ?? undefined,
        })
      ) {
        created++;
      }
    }
    this.logger.log(`generated ${created} conversion events`);
    return { created };
  }

  /** Push PENDING events to Meta and record the verdict. Connector is injectable for tests. */
  async push(tenantId: string, connector: AdConnector = this.connector) {
    const pending = await this.db.$base.conversionEvent.findMany({
      where: { tenantId, state: 'PENDING' },
      take: 500,
    });
    let accepted = 0;
    let rejected = 0;
    for (const ev of pending) {
      const acc = await this.db.$base.adAccount.findUnique({ where: { id: ev.adAccountId } });
      if (!acc || !connector.pushConversion) continue;
      try {
        const res = await connector.pushConversion(
          {
            id: acc.id,
            provider: 'META',
            externalId: acc.externalId,
            token: this.vault.retrieve(acc.tokenRef),
            timezone: acc.timezone,
            currency: acc.currency,
          },
          {
            type: ev.type as ConversionType,
            eventId: ev.eventId,
            leadgenId: ev.leadgenId ?? undefined,
            value: ev.value ? Number(ev.value) : undefined,
            currency: ev.currency ?? undefined,
            userData: await this.userDataFor(ev.eventId),
            occurredAt: new Date().toISOString(),
          },
        );
        await this.db.$base.conversionEvent.update({
          where: { id: ev.id },
          data: {
            state: res.accepted ? 'ACCEPTED' : 'REJECTED',
            response: res.raw as Prisma.InputJsonValue,
            sentAt: new Date(),
          },
        });
        res.accepted ? accepted++ : rejected++;
      } catch (err) {
        await this.db.$base.conversionEvent.update({
          where: { id: ev.id },
          data: { state: 'REJECTED', response: { error: String(err) }, sentAt: new Date() },
        });
        rejected++;
      }
    }
    return { sent: pending.length, accepted, rejected };
  }

  list(tenantId: string) {
    return this.db.$base.conversionEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async createEvent(
    tenantId: string,
    adAccountId: string,
    type: ConversionType,
    eventId: string,
    extra: { leadgenId?: string | null; value?: number; currency?: string },
  ): Promise<boolean> {
    const existing = await this.db.$base.conversionEvent.findUnique({ where: { eventId } });
    if (existing) return false;
    await this.db.$base.conversionEvent.create({
      data: {
        tenantId,
        adAccountId,
        type,
        eventId,
        leadgenId: extra.leadgenId ?? null,
        value: extra.value ?? null,
        currency: extra.currency ?? null,
      },
    });
    return true;
  }

  /** Hashed (sha256) user_data for Meta — never raw PII. */
  private async userDataFor(eventId: string): Promise<{ phone?: string; email?: string }> {
    let contactId: string | null = null;
    if (eventId.startsWith('QL:')) {
      const lead = await this.db.$base.lead.findUnique({
        where: { id: eventId.slice(3) },
        select: { contactId: true },
      });
      contactId = lead?.contactId ?? null;
    } else if (eventId.startsWith('PUR:')) {
      const deal = await this.db.$base.deal.findUnique({
        where: { id: eventId.slice(4) },
        select: { contactId: true },
      });
      contactId = deal?.contactId ?? null;
    }
    if (!contactId) return {};
    const ids = await this.db.$base.contactIdentifier.findMany({
      where: { contactId },
      select: { type: true, hash: true },
    });
    return {
      phone: ids.find((i) => i.type === 'PHONE')?.hash,
      email: ids.find((i) => i.type === 'EMAIL')?.hash,
    };
  }
}
