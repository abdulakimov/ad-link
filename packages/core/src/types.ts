import type {
  AdProvider,
  CanonicalStatus,
  ConversionType,
  CrmProvider,
  LeadSource,
} from './enums.js';

export interface DateRange {
  /** inclusive, ISO date (YYYY-MM-DD), in the ad account timezone */
  from: string;
  to: string;
}

/** Money is always native amount + currency. Conversion is dated, done in aggregation. */
export interface Money {
  amount: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Connector references (what an impl needs to talk to a provider)
// ---------------------------------------------------------------------------
export interface AdAccountRef {
  id: string; // our AdAccount.id
  provider: AdProvider;
  externalId: string; // act_<id>
  token: string; // decrypted, short-lived in memory only
  timezone: string;
  currency: string;
}

export interface CrmRef {
  id: string; // our CrmConnection.id
  provider: CrmProvider;
  externalRef: string; // portal/base url or account id
  auth: string; // decrypted
}

// ---------------------------------------------------------------------------
// Raw provider payloads (loose) → connectors normalize() into canonical inputs
// ---------------------------------------------------------------------------
export interface RawHierarchy {
  campaigns: RawCampaign[];
}
export interface RawCampaign {
  externalId: string;
  name: string;
  status?: string;
  /** Provider's actual delivery state (e.g. Meta's effective_status: WITH_ISSUES, PENDING_BILLING_INFO), distinct from the on/off toggle in `status`. */
  effectiveStatus?: string;
  adSets: RawAdSet[];
}
export interface RawAdSet {
  externalId: string;
  name: string;
  status?: string;
  effectiveStatus?: string;
  ads: RawAd[];
}
export interface RawAd {
  externalId: string;
  name: string;
  status?: string;
  effectiveStatus?: string;
  creativeExternalId?: string;
  creativeName?: string;
}

export interface RawInsight {
  adExternalId: string;
  date: string; // YYYY-MM-DD (account TZ)
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  reach?: number;
  frequency?: number;
}

export interface RawLead {
  source: LeadSource;
  externalId?: string;
  leadgenId?: string;
  adExternalId?: string;
  fbclid?: string;
  utm?: Partial<Record<'source' | 'medium' | 'campaign' | 'content' | 'term', string>>;
  name?: string;
  phones?: string[];
  emails?: string[];
  createdAt: string; // ISO
}

export interface RawStage {
  externalId: string;
  name: string;
}

export interface RawDeal {
  externalId: string;
  contactExternalId?: string;
  stageExternalId: string;
  amount?: number;
  currency?: string;
  createdAt: string;
  wonAt?: string;
}

export interface RawContact {
  externalId: string;
  name?: string;
  phones?: string[];
  emails?: string[];
}

// ---------------------------------------------------------------------------
// Feedback loop (write to Meta CAPI)
// ---------------------------------------------------------------------------
export interface ConversionPayload {
  type: ConversionType;
  eventId: string; // stable dedup id
  leadgenId?: string;
  value?: number;
  currency?: string;
  /** already-hashed (sha256) user data — never raw PII */
  userData?: { phone?: string; email?: string };
  occurredAt: string;
}

export interface PushResult {
  accepted: boolean;
  raw: unknown;
}

// ---------------------------------------------------------------------------
// The connector SDK — every provider implements one of these. Business logic
// never sees Meta/Bitrix field names; it sees only the canonical shapes above.
// ---------------------------------------------------------------------------
export interface AdConnector {
  fetchAdHierarchy(acc: AdAccountRef): Promise<RawHierarchy>;
  fetchInsights(acc: AdAccountRef, range: DateRange): Promise<RawInsight[]>;
  fetchLeads?(acc: AdAccountRef, since: Date): Promise<RawLead[]>;
  pushConversion?(acc: AdAccountRef, ev: ConversionPayload): Promise<PushResult>;
  subscribeWebhooks?(acc: AdAccountRef): Promise<void>;
}

export interface CrmConnector {
  fetchStages(conn: CrmRef): Promise<RawStage[]>;
  fetchLeads(conn: CrmRef, since: Date): Promise<RawLead[]>;
  fetchDeals(conn: CrmRef, since: Date): Promise<RawDeal[]>;
  fetchContacts(conn: CrmRef, since: Date): Promise<RawContact[]>;
  /** Every stage a deal has ever passed through — lets us mark a deal qualified
   *  if it was *ever* in a qualifying stage, not just its current one. */
  fetchDealStageHistory?(conn: CrmRef, since: Date): Promise<RawDealStageHistory[]>;
  subscribeWebhooks?(conn: CrmRef): Promise<void>;
}

export interface RawDealStageHistory {
  dealExternalId: string;
  stageExternalId: string;
}

// ---------------------------------------------------------------------------
// Shared read model — the performance table row (api computes, web renders)
// ---------------------------------------------------------------------------
export interface MetricRow {
  level: 'campaign' | 'adset' | 'ad';
  id: string;
  name: string;
  parentId: string | null;
  status?: string | null;
  /** Provider's actual delivery state, distinct from the on/off toggle in `status` (e.g. Meta's effective_status). */
  effectiveStatus?: string | null;
  /** report currency (per-tenant); raw native values live in the DB */
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualifiedLeads: number;
  sales: number;
  revenue: number;
  // derived (null when the denominator is 0 → UI shows "—")
  ctr: number | null;
  cpl: number | null;
  qlRate: number | null;
  costPerQl: number | null;
  cac: number | null;
  roas: number | null;
  arpl: number | null;
  convRate: number | null;
}

export interface StageMappingInput {
  externalStageId: string;
  externalStageName: string;
  canonical: CanonicalStatus;
}
