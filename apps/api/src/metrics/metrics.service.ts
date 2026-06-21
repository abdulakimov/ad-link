import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { deriveMetrics, type MetricRow, recommend } from '@adlink/core';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';

interface Range {
  from: string; // YYYY-MM-DD
  to: string;
}

export type TouchModel = 'FIRST_TOUCH' | 'LAST_TOUCH';
export type CreativeDimension = 'hook' | 'concept' | 'angle' | 'format' | 'video';

export interface CohortRow {
  week: string; // Monday of the cohort week, YYYY-MM-DD
  leads: number;
  qualifiedLeads: number;
  sales: number;
  revenue: number;
  spend: number;
  roas: number | null;
}

interface Acc {
  level: 'campaign' | 'adset' | 'ad';
  id: string;
  name: string;
  parentId: string | null;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualifiedLeads: number;
  sales: number;
  revenue: number;
}

/**
 * True unit economics per ad / ad set / campaign (PLAN §10). A deal is credited to the
 * contact's first- or last-touch ad (PLAN §9). Leads/QL are counted at the lead level;
 * sales/revenue at the deal level, attributed by the chosen model. Money is summed in
 * the tenant's report currency via dated FX.
 */
@Injectable()
export class MetricsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async performance(
    tenantId: string,
    range: Range,
    model: TouchModel = 'LAST_TOUCH',
  ): Promise<{ currency: string; model: TouchModel; rows: MetricRow[] }> {
    const tenant = await this.db.$base.tenant.findUnique({ where: { id: tenantId } });
    const reportCurrency = tenant?.reportCurrency ?? 'USD';
    const fromD = new Date(`${range.from}T00:00:00.000Z`);
    const toD = new Date(`${range.to}T23:59:59.999Z`);
    const fx = await this.loadFx();
    const convert = (amount: number, from: string) =>
      from === reportCurrency ? amount : amount * (fx.get(`${from}>${reportCurrency}`) ?? 1);

    // --- hierarchy + accumulators ---
    const ads = await this.db.$base.ad.findMany({
      where: { tenantId },
      include: { adSet: { include: { campaign: { include: { adAccount: true } } } } },
    });
    const acc = new Map<string, Acc>();
    const ensure = (a: Acc) => {
      if (!acc.has(a.id)) acc.set(a.id, a);
    };
    const adMeta = new Map<string, { adsetId: string; campaignId: string; currency: string }>();
    for (const ad of ads) {
      ensure({ level: 'ad', id: ad.id, name: ad.name, parentId: ad.adSetId, status: ad.status, ...zero() });
      ensure({ level: 'adset', id: ad.adSet.id, name: ad.adSet.name, parentId: ad.adSet.campaignId, status: ad.adSet.status, ...zero() });
      ensure({ level: 'campaign', id: ad.adSet.campaign.id, name: ad.adSet.campaign.name, parentId: null, status: ad.adSet.campaign.status, ...zero() });
      adMeta.set(ad.id, {
        adsetId: ad.adSet.id,
        campaignId: ad.adSet.campaign.id,
        currency: ad.adSet.campaign.adAccount.currency,
      });
    }
    const addUp = (adId: string, fn: (a: Acc) => void) => {
      const m = adMeta.get(adId);
      if (!m) return;
      for (const id of [adId, m.adsetId, m.campaignId]) {
        const node = acc.get(id);
        if (node) fn(node);
      }
    };

    // --- spend / impressions / clicks (in range) ---
    const insights = await this.db.$base.adInsightDaily.groupBy({
      by: ['adId'],
      where: { tenantId, date: { gte: fromD, lte: toD } },
      _sum: { spend: true, impressions: true, clicks: true },
    });
    for (const row of insights) {
      const currency = adMeta.get(row.adId)?.currency ?? reportCurrency;
      const spend = convert(Number(row._sum.spend ?? 0), currency);
      addUp(row.adId, (a) => {
        a.spend += spend;
        a.impressions += row._sum.impressions ?? 0;
        a.clicks += row._sum.clicks ?? 0;
      });
    }

    // --- contact → attributed ad, by model (across all matched leads) ---
    const allLeads = await this.db.$base.lead.findMany({
      where: { tenantId, adId: { not: null }, matchStatus: 'MATCHED', contactId: { not: null } },
      select: { adId: true, contactId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const contactAd = new Map<string, string>();
    for (const l of allLeads) {
      // asc order → first sets FIRST_TOUCH; overwrite each time for LAST_TOUCH
      if (model === 'FIRST_TOUCH') {
        if (!contactAd.has(l.contactId!)) contactAd.set(l.contactId!, l.adId!);
      } else {
        contactAd.set(l.contactId!, l.adId!);
      }
    }

    // --- leads (cohort by created date) + qualified (lead-level) ---
    const leadsInRange = await this.db.$base.lead.findMany({
      where: { tenantId, adId: { not: null }, matchStatus: 'MATCHED', createdAt: { gte: fromD, lte: toD } },
      select: { adId: true, contactId: true },
    });
    const contactsInRange = new Set(
      leadsInRange.map((l) => l.contactId).filter((x): x is string => !!x),
    );

    const deals = contactsInRange.size
      ? await this.db.$base.deal.findMany({
          where: { tenantId, contactId: { in: [...contactsInRange] } },
          select: { contactId: true, canonical: true, amount: true, currency: true },
        })
      : [];
    const qualifiedContacts = new Set<string>();
    for (const d of deals) {
      if (d.contactId && (d.canonical === 'QUALIFIED' || d.canonical === 'WON')) {
        qualifiedContacts.add(d.contactId);
      }
    }

    for (const lead of leadsInRange) {
      addUp(lead.adId!, (a) => {
        a.leads += 1;
        if (lead.contactId && qualifiedContacts.has(lead.contactId)) a.qualifiedLeads += 1;
      });
    }

    // --- sales + revenue (deal-level, attributed by model) for in-range contacts ---
    for (const d of deals) {
      if (d.canonical !== 'WON' || !d.contactId) continue;
      const adId = contactAd.get(d.contactId);
      if (!adId) continue;
      const revenue = convert(Number(d.amount ?? 0), d.currency ?? reportCurrency);
      addUp(adId, (a) => {
        a.sales += 1;
        a.revenue += revenue;
      });
    }

    const rows = [...acc.values()].map((a) => this.toRow(a, reportCurrency));
    return { currency: reportCurrency, model, rows };
  }

  /**
   * Vintage cohort report (PLAN §9): group leads by the week they were generated and
   * track how many of that cohort qualified / purchased so far, with cohort ROAS =
   * revenue-from-those-leads / spend-in-that-week. Prevents the classic error of
   * dividing today's revenue by today's spend.
   */
  async cohorts(tenantId: string, range: Range): Promise<{ currency: string; cohorts: CohortRow[] }> {
    const tenant = await this.db.$base.tenant.findUnique({ where: { id: tenantId } });
    const reportCurrency = tenant?.reportCurrency ?? 'USD';
    const fromD = new Date(`${range.from}T00:00:00.000Z`);
    const toD = new Date(`${range.to}T23:59:59.999Z`);
    const fx = await this.loadFx();
    const convert = (amount: number, from: string) =>
      from === reportCurrency ? amount : amount * (fx.get(`${from}>${reportCurrency}`) ?? 1);

    const weeks = new Map<string, CohortRow>();
    const ensureWeek = (w: string) => {
      let row = weeks.get(w);
      if (!row) {
        row = { week: w, leads: 0, qualifiedLeads: 0, sales: 0, revenue: 0, spend: 0, roas: null };
        weeks.set(w, row);
      }
      return row;
    };

    // leads → cohort week (earliest lead per contact defines its vintage)
    const leads = await this.db.$base.lead.findMany({
      where: { tenantId, matchStatus: 'MATCHED', createdAt: { gte: fromD, lte: toD } },
      select: { contactId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const contactWeek = new Map<string, string>();
    for (const l of leads) {
      const w = mondayOf(l.createdAt);
      ensureWeek(w).leads += 1;
      if (l.contactId && !contactWeek.has(l.contactId)) contactWeek.set(l.contactId, w);
    }

    const contactIds = [...contactWeek.keys()];
    const deals = contactIds.length
      ? await this.db.$base.deal.findMany({
          where: { tenantId, contactId: { in: contactIds } },
          select: { contactId: true, canonical: true, amount: true, currency: true },
        })
      : [];
    const qualified = new Set<string>();
    const won = new Map<string, { count: number; revenue: number }>();
    for (const d of deals) {
      if (!d.contactId) continue;
      if (d.canonical === 'QUALIFIED' || d.canonical === 'WON') qualified.add(d.contactId);
      if (d.canonical === 'WON') {
        const cur = won.get(d.contactId) ?? { count: 0, revenue: 0 };
        cur.count += 1;
        cur.revenue += convert(Number(d.amount ?? 0), d.currency ?? reportCurrency);
        won.set(d.contactId, cur);
      }
    }
    for (const [contactId, w] of contactWeek) {
      const row = ensureWeek(w);
      if (qualified.has(contactId)) row.qualifiedLeads += 1;
      const wonAgg = won.get(contactId);
      if (wonAgg) {
        row.sales += wonAgg.count;
        row.revenue += wonAgg.revenue;
      }
    }

    // spend per cohort week
    const insights = await this.db.$base.adInsightDaily.findMany({
      where: { tenantId, date: { gte: fromD, lte: toD } },
      select: { date: true, spend: true, currency: true },
    });
    for (const ins of insights) {
      ensureWeek(mondayOf(ins.date)).spend += convert(Number(ins.spend), ins.currency);
    }

    const cohorts = [...weeks.values()]
      .map((c) => ({ ...c, spend: round(c.spend), revenue: round(c.revenue), roas: c.spend ? c.revenue / c.spend : null }))
      .sort((a, b) => a.week.localeCompare(b.week));
    return { currency: reportCurrency, cohorts };
  }

  /** Aggregate ad performance by a parsed creative dimension (hook/concept/…) so the
   *  team learns which creative *ideas* convert, not just which ad ids (PLAN §11). */
  async creativeInsights(
    tenantId: string,
    range: Range,
    dimension: CreativeDimension,
    model: TouchModel = 'LAST_TOUCH',
  ) {
    const { currency, rows } = await this.performance(tenantId, range, model);
    const ads = await this.db.$base.ad.findMany({
      where: { tenantId },
      select: { id: true, creative: { select: { hook: true, concept: true, angle: true, format: true, video: true } } },
    });
    const dimByAd = new Map(ads.map((a) => [a.id, (a.creative?.[dimension] ?? null) || '(untagged)']));

    const groups = new Map<string, ReturnType<typeof zero> & { value: string }>();
    for (const r of rows) {
      if (r.level !== 'ad') continue;
      const value = dimByAd.get(r.id) ?? '(untagged)';
      let g = groups.get(value);
      if (!g) {
        g = { value, ...zero() };
        groups.set(value, g);
      }
      g.spend += r.spend;
      g.impressions += r.impressions;
      g.clicks += r.clicks;
      g.leads += r.leads;
      g.qualifiedLeads += r.qualifiedLeads;
      g.sales += r.sales;
      g.revenue += r.revenue;
    }
    const out = [...groups.values()]
      .map((g) => ({ dimension, value: g.value, spend: round(g.spend), leads: g.leads, qualifiedLeads: g.qualifiedLeads, sales: g.sales, revenue: round(g.revenue), ...deriveMetrics(g) }))
      .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1));
    return { currency, dimension, rows: out };
  }

  /** "Scale this / pause that" intelligence over the current performance (PLAN §16). */
  async recommendations(tenantId: string, range: Range, model: TouchModel = 'LAST_TOUCH') {
    const { currency, rows } = await this.performance(tenantId, range, model);
    return { currency, recommendations: recommend(rows) };
  }

  /** Full path of a lead: touchpoints → lead → qualified → won (PLAN §11). */
  async journey(tenantId: string, leadId: string) {
    const lead = await this.db.$base.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        ad: { include: { adSet: { include: { campaign: true } } } },
        contact: { include: { deals: { orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const touchPoints = await this.db.$base.touchPoint.findMany({
      where: { tenantId, OR: [{ leadId }, { contactId: lead.contactId ?? undefined }] },
      orderBy: { occurredAt: 'asc' },
    });

    return {
      lead: {
        id: lead.id,
        source: lead.source,
        createdAt: lead.createdAt,
        matchMethod: lead.matchMethod,
        matchStatus: lead.matchStatus,
        confidence: lead.confidence,
      },
      ad: lead.ad
        ? { id: lead.ad.id, name: lead.ad.name, adSet: lead.ad.adSet.name, campaign: lead.ad.adSet.campaign.name }
        : null,
      contact: lead.contact ? { id: lead.contact.id, name: lead.contact.name } : null,
      deals: (lead.contact?.deals ?? []).map((d) => ({
        id: d.id,
        canonical: d.canonical,
        amount: d.amount ? Number(d.amount) : null,
        currency: d.currency,
        createdAt: d.createdAt,
        wonAt: d.wonAt,
      })),
      touchPoints: touchPoints.map((t) => ({ type: t.type, occurredAt: t.occurredAt, adId: t.adId })),
    };
  }

  private toRow(a: Acc, currency: string): MetricRow {
    return {
      level: a.level,
      id: a.id,
      name: a.name,
      parentId: a.parentId,
      status: a.status,
      currency,
      spend: round(a.spend),
      impressions: a.impressions,
      clicks: a.clicks,
      leads: a.leads,
      qualifiedLeads: a.qualifiedLeads,
      sales: a.sales,
      revenue: round(a.revenue),
      ...deriveMetrics(a),
    };
  }

  private async loadFx(): Promise<Map<string, number>> {
    const rates = await this.db.$base.fxRate.findMany({ orderBy: { date: 'desc' } });
    const map = new Map<string, number>();
    for (const r of rates) {
      const key = `${r.base}>${r.quote}`;
      if (!map.has(key)) map.set(key, Number(r.rate));
    }
    return map;
  }
}

function zero() {
  return { spend: 0, impressions: 0, clicks: 0, leads: 0, qualifiedLeads: 0, sales: 0, revenue: 0 };
}
function round(n: number) {
  return Math.round(n * 100) / 100;
}
/** Monday (UTC) of the week containing d, as YYYY-MM-DD — the cohort key. */
function mondayOf(d: Date): string {
  const x = new Date(d);
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}
