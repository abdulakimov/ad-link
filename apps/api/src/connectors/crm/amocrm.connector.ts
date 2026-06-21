import { Injectable } from '@nestjs/common';
import type { CrmConnector, CrmRef, RawContact, RawDeal, RawLead, RawStage } from '@adlink/core';

/* eslint-disable @typescript-eslint/no-explicit-any -- amoCRM REST payloads are external/untyped */

/**
 * amoCRM / Kommo reader (OAuth2 bearer). Proves the connector abstraction: the same
 * CrmConnector interface + CrmSyncService + stage mapping work unchanged for a second CRM.
 * conn.externalRef = base url (https://sub.amocrm.ru), conn.auth = access token.
 * In amoCRM the inquiry IS the deal (сделка) — there is no separate lead entity.
 */
@Injectable()
export class AmoConnector implements CrmConnector {
  async fetchStages(conn: CrmRef): Promise<RawStage[]> {
    const json = await this.get(conn, '/api/v4/leads/pipelines');
    const stages: RawStage[] = [];
    for (const p of json?._embedded?.pipelines ?? []) {
      for (const s of p?._embedded?.statuses ?? []) {
        stages.push({ externalId: String(s.id), name: String(s.name) });
      }
    }
    return stages;
  }

  async fetchContacts(conn: CrmRef, since: Date): Promise<RawContact[]> {
    const items = await this.paged(conn, '/api/v4/contacts', 'contacts', since);
    return items.map((c) => ({
      externalId: String(c.id),
      name: c.name ?? undefined,
      phones: this.field(c, 'PHONE'),
      emails: this.field(c, 'EMAIL'),
    }));
  }

  async fetchDeals(conn: CrmRef, since: Date): Promise<RawDeal[]> {
    const items = await this.paged(conn, '/api/v4/leads', 'leads', since);
    return items.map((l) => ({
      externalId: String(l.id),
      contactExternalId: this.mainContact(l),
      stageExternalId: String(l.status_id),
      amount: l.price != null ? Number(l.price) : undefined,
      createdAt: this.iso(l.created_at),
      wonAt: l.closed_at ? this.iso(l.closed_at) : undefined,
    }));
  }

  async fetchLeads(): Promise<RawLead[]> {
    return []; // amoCRM models the inquiry as a deal — see fetchDeals
  }

  // ---- helpers ----
  private async get(conn: CrmRef, path: string): Promise<any> {
    const res = await fetch(`${this.base(conn)}${path}`, {
      headers: { Authorization: `Bearer ${conn.auth}` },
    });
    if (res.status === 204) return {};
    if (!res.ok) throw new Error(`amoCRM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  private async paged(conn: CrmRef, path: string, key: string, since: Date): Promise<any[]> {
    const out: any[] = [];
    const from = Math.floor(since.getTime() / 1000);
    let page = 1;
    let guard = 0;
    while (guard++ < 1000) {
      const filter = from > 0 ? `&filter[updated_at][from]=${from}` : '';
      const res = await fetch(`${this.base(conn)}${path}?page=${page}&limit=250${filter}`, {
        headers: { Authorization: `Bearer ${conn.auth}` },
      });
      if (res.status === 204) break; // amoCRM: no content => end of pages
      if (!res.ok) throw new Error(`amoCRM ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as any;
      out.push(...(json?._embedded?.[key] ?? []));
      if (!json?._links?.next) break;
      page++;
    }
    return out;
  }

  private base(conn: CrmRef) {
    return conn.externalRef.replace(/\/$/, '');
  }

  private field(entity: any, code: string): string[] {
    const f = (entity?.custom_fields_values ?? []).find((x: any) => x.field_code === code);
    return (f?.values ?? []).map((v: any) => String(v.value)).filter(Boolean);
  }

  private mainContact(lead: any): string | undefined {
    const contacts = lead?._embedded?.contacts ?? [];
    const main = contacts.find((c: any) => c.is_main) ?? contacts[0];
    return main ? String(main.id) : undefined;
  }

  private iso(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toISOString();
  }
}
