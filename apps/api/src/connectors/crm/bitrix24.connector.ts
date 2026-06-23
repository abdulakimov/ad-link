import { Injectable } from '@nestjs/common';
import type {
  CrmConnector,
  CrmRef,
  RawContact,
  RawDeal,
  RawDealStageHistory,
  RawLead,
  RawStage,
} from '@adlink/core';

/* eslint-disable @typescript-eslint/no-explicit-any -- Bitrix REST payloads are external/untyped */

/**
 * Bitrix24 reader via an inbound-webhook base URL (stored encrypted, decrypted into
 * `conn.auth`). Verify method/field names against current Bitrix REST docs.
 */
@Injectable()
export class Bitrix24Connector implements CrmConnector {
  async fetchStages(conn: CrmRef): Promise<RawStage[]> {
    const base = this.base(conn);
    const p = new URLSearchParams({ 'filter[ENTITY_ID]': 'DEAL_STAGE' });
    const rows = await this.callList(`${base}/crm.status.list.json?${p.toString()}`);
    return rows.map((s: any) => ({ externalId: String(s.STATUS_ID), name: String(s.NAME) }));
  }

  async fetchDeals(conn: CrmRef, since: Date): Promise<RawDeal[]> {
    const select = ['ID', 'STAGE_ID', 'OPPORTUNITY', 'CURRENCY_ID', 'CONTACT_ID', 'DATE_CREATE', 'CLOSEDATE', 'CLOSED'];
    const rows = await this.paged((start) =>
      this.url(conn, 'crm.deal.list', select, since, start),
    );
    const deals = rows.map((d: any) => ({
      externalId: String(d.ID),
      contactExternalId: d.CONTACT_ID ? String(d.CONTACT_ID) : undefined,
      stageExternalId: String(d.STAGE_ID),
      amount: d.OPPORTUNITY != null ? Number(d.OPPORTUNITY) : undefined,
      currency: d.CURRENCY_ID ? String(d.CURRENCY_ID) : undefined,
      createdAt: String(d.DATE_CREATE),
      wonAt: d.CLOSED === 'Y' && d.CLOSEDATE ? String(d.CLOSEDATE) : undefined,
    }));
    // Deals with no primary CONTACT_ID may still be bound to contacts → recover the first.
    // ponytail: one extra call per contactless deal; batch via crm.deal.contact.items.list if it gets hot.
    const base = this.base(conn);
    for (const d of deals) {
      if (d.contactExternalId) continue;
      const items = await this.callList(`${base}/crm.deal.contact.items.get.json?id=${d.externalId}`);
      const primary = items.find((i: any) => i.IS_PRIMARY === 'Y') ?? items[0];
      if (primary?.CONTACT_ID) d.contactExternalId = String(primary.CONTACT_ID);
    }
    return deals;
  }

  async fetchContacts(conn: CrmRef, since: Date): Promise<RawContact[]> {
    const select = ['ID', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL'];
    const rows = await this.paged((start) =>
      this.url(conn, 'crm.contact.list', select, since, start),
    );
    return rows.map((c: any) => ({
      externalId: String(c.ID),
      name: [c.NAME, c.LAST_NAME].filter(Boolean).join(' ') || undefined,
      phones: this.multi(c.PHONE),
      emails: this.multi(c.EMAIL),
    }));
  }

  async fetchLeads(conn: CrmRef, since: Date): Promise<RawLead[]> {
    // UTM_* are standard Bitrix lead fields — they carry the web/ad attribution tags.
    const select = [
      'ID', 'TITLE', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL', 'DATE_CREATE',
      'UTM_SOURCE', 'UTM_MEDIUM', 'UTM_CAMPAIGN', 'UTM_CONTENT', 'UTM_TERM',
    ];
    const rows = await this.paged((start) =>
      this.url(conn, 'crm.lead.list', select, since, start),
    );
    return rows.map((l: any) => ({
      source: 'CRM' as const,
      externalId: String(l.ID),
      name: [l.NAME, l.LAST_NAME].filter(Boolean).join(' ') || l.TITLE || undefined,
      phones: this.multi(l.PHONE),
      emails: this.multi(l.EMAIL),
      utm: this.utm(l),
      createdAt: String(l.DATE_CREATE),
    }));
  }

  /** Every stage transition a deal went through (crm.stagehistory, entityTypeId 2 = deal). */
  async fetchDealStageHistory(conn: CrmRef, since: Date): Promise<RawDealStageHistory[]> {
    const base = this.base(conn);
    const out: RawDealStageHistory[] = [];
    let start = 0;
    let guard = 0;
    while (guard++ < 2000) {
      const p = new URLSearchParams();
      p.set('entityTypeId', '2');
      p.set('order[CREATED_TIME]', 'ASC');
      p.set('filter[>=CREATED_TIME]', since.toISOString());
      ['OWNER_ID', 'STAGE_ID'].forEach((s) => p.append('select[]', s));
      p.set('start', String(start));
      const res = await fetch(`${base}/crm.stagehistory.list.json?${p.toString()}`);
      if (!res.ok) throw new Error(`Bitrix ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { result?: { items?: any[] }; next?: number };
      for (const it of json.result?.items ?? []) {
        if (it.OWNER_ID != null && it.STAGE_ID != null) {
          out.push({ dealExternalId: String(it.OWNER_ID), stageExternalId: String(it.STAGE_ID) });
        }
      }
      if (json.next == null) break;
      start = json.next;
    }
    return out;
  }

  // ---- helpers ----
  private base(conn: CrmRef) {
    return conn.auth.replace(/\/$/, '');
  }

  private url(conn: CrmRef, method: string, select: string[], since: Date, start: number) {
    const p = new URLSearchParams();
    select.forEach((s) => p.append('select[]', s));
    p.set('filter[>DATE_MODIFY]', since.toISOString());
    p.set('start', String(start));
    return `${this.base(conn)}/${method}.json?${p.toString()}`;
  }

  /** Pick the UTM tags Bitrix stored on the lead; undefined when none are present. */
  private utm(row: any): RawLead['utm'] {
    const pairs: Array<[keyof NonNullable<RawLead['utm']>, any]> = [
      ['source', row.UTM_SOURCE],
      ['medium', row.UTM_MEDIUM],
      ['campaign', row.UTM_CAMPAIGN],
      ['content', row.UTM_CONTENT],
      ['term', row.UTM_TERM],
    ];
    const out: NonNullable<RawLead['utm']> = {};
    for (const [k, v] of pairs) if (v) out[k] = String(v);
    return Object.keys(out).length ? out : undefined;
  }

  /** Bitrix multi-fields look like [{ VALUE: '...', VALUE_TYPE: 'WORK' }]. */
  private multi(field: any): string[] {
    if (!Array.isArray(field)) return [];
    return field.map((f) => String(f?.VALUE ?? '')).filter(Boolean);
  }

  private async callList(url: string): Promise<any[]> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bitrix ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { result?: any[] };
    return json.result ?? [];
  }

  private async paged(buildUrl: (start: number) => string): Promise<any[]> {
    const out: any[] = [];
    let start = 0;
    let guard = 0;
    while (guard++ < 1000) {
      const res = await fetch(buildUrl(start));
      if (!res.ok) throw new Error(`Bitrix ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { result?: any[]; next?: number };
      if (Array.isArray(json.result)) out.push(...json.result);
      if (json.next == null) break;
      start = json.next;
    }
    return out;
  }
}
