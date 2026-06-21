import { Injectable, Logger } from '@nestjs/common';
import type {
  AdAccountRef,
  AdConnector,
  ConversionPayload,
  DateRange,
  PushResult,
  RawHierarchy,
  RawInsight,
} from '@adlink/core';

/* eslint-disable @typescript-eslint/no-explicit-any -- Graph API payloads are external/untyped */
const graph = (v: string) => `https://graph.facebook.com/${v}`;

/**
 * Meta Marketing API reader. Verify field/endpoint names against current official
 * docs at build time — versions matter (PLAN §6).
 * ponytail: nested edges fetched with .limit(500); paginate each level when an
 * account exceeds that (logged below).
 */
@Injectable()
export class MetaConnector implements AdConnector {
  private readonly logger = new Logger(MetaConnector.name);
  private readonly version = process.env.META_API_VERSION ?? 'v21.0';

  async fetchAdHierarchy(acc: AdAccountRef): Promise<RawHierarchy> {
    const fields =
      'name,status,adsets.limit(500){name,status,ads.limit(500){name,status,creative{id,name}}}';
    const url = `${graph(this.version)}/${acc.externalId}/campaigns?fields=${encodeURIComponent(
      fields,
    )}&limit=200`;
    const campaigns = await this.pagedGet<any>(url, acc.token);
    return {
      campaigns: campaigns.map((c) => ({
        externalId: c.id,
        name: c.name,
        status: c.status,
        adSets: (c.adsets?.data ?? []).map((s: any) => ({
          externalId: s.id,
          name: s.name,
          status: s.status,
          ads: (s.ads?.data ?? []).map((a: any) => ({
            externalId: a.id,
            name: a.name,
            status: a.status,
            creativeExternalId: a.creative?.id,
            creativeName: a.creative?.name,
          })),
        })),
      })),
    };
  }

  async fetchInsights(acc: AdAccountRef, range: DateRange): Promise<RawInsight[]> {
    const fields = 'ad_id,spend,impressions,clicks,reach,frequency,date_start';
    const timeRange = encodeURIComponent(JSON.stringify({ since: range.from, until: range.to }));
    const url = `${graph(this.version)}/${acc.externalId}/insights?level=ad&fields=${fields}&time_range=${timeRange}&time_increment=1&limit=500`;
    const rows = await this.pagedGet<any>(url, acc.token);
    return rows.map((r) => ({
      adExternalId: r.ad_id,
      date: r.date_start,
      spend: Number(r.spend ?? 0),
      currency: acc.currency,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      reach: r.reach != null ? Number(r.reach) : undefined,
      frequency: r.frequency != null ? Number(r.frequency) : undefined,
    }));
  }

  /**
   * Report an outcome back to Meta via the Conversions API. The dataset id comes from
   * config (per-account dataset wiring is a Phase 10 hardening item); without it we
   * record a clear rejection so the audit trail explains why nothing was sent.
   */
  async pushConversion(acc: AdAccountRef, ev: ConversionPayload): Promise<PushResult> {
    const datasetId = process.env.META_DATASET_ID;
    if (!datasetId) return { accepted: false, raw: { error: 'META_DATASET_ID not configured' } };

    const url = `${graph(this.version)}/${datasetId}/events?access_token=${encodeURIComponent(acc.token)}`;
    const payload = {
      data: [
        {
          event_name: ev.type === 'PURCHASE' ? 'Purchase' : 'Lead',
          event_time: Math.floor(new Date(ev.occurredAt).getTime() / 1000),
          event_id: ev.eventId, // dedup key on Meta's side
          action_source: 'system_generated',
          user_data: {
            ...(ev.userData?.email ? { em: [ev.userData.email] } : {}),
            ...(ev.userData?.phone ? { ph: [ev.userData.phone] } : {}),
            ...(ev.leadgenId ? { lead_id: ev.leadgenId } : {}),
          },
          ...(ev.value ? { custom_data: { value: ev.value, currency: ev.currency ?? 'USD' } } : {}),
        },
      ],
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { accepted: res.ok, raw: await res.json().catch(() => ({})) };
  }

  /** Follows Graph API cursor pagination, collecting every `data` row. */
  private async pagedGet<T>(firstUrl: string, token: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | undefined = this.withToken(firstUrl, token);
    let guard = 0;
    while (url && guard++ < 1000) {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Meta API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const json = (await res.json()) as { data?: T[]; paging?: { next?: string } };
      if (json.data) out.push(...json.data);
      url = json.paging?.next; // Graph "next" is absolute and already carries the token
    }
    if (guard >= 1000) this.logger.warn('pagedGet hit the 1000-page guard');
    return out;
  }

  private withToken(url: string, token: string): string {
    return url.includes('access_token=')
      ? url
      : `${url}&access_token=${encodeURIComponent(token)}`;
  }
}
