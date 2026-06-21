import type { MetricRow } from '@adlink/core';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, opts: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  tenantId: string;
  clientId: string | null;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

export interface Client {
  id: string;
  name: string;
}

export interface ConnectMetaInput {
  clientId?: string;
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  token: string;
}

export interface ConnectBitrixInput {
  clientId?: string;
  portal: string;
  webhookUrl: string;
}

export interface ConnectAmoInput {
  clientId?: string;
  baseUrl: string;
  accessToken: string;
}

export type CanonicalStatus = 'LEAD' | 'QUALIFIED' | 'WON' | 'LOST' | 'IGNORE';

export interface Stage {
  externalId: string;
  name: string;
}

export interface StageMappingRow {
  externalStageId: string;
  externalStageName: string;
  canonical: CanonicalStatus;
}

export interface AdAccountDto {
  id: string;
  name: string | null;
  externalId: string;
  currency: string;
  syncState: string;
  feedbackOptIn: boolean;
  lastSyncAt: string | null;
}

export interface CrmConnectionDto {
  id: string;
  provider: string;
  externalRef: string;
  syncState: string;
}

export interface Recommendation {
  type: 'scale' | 'pause' | 'investigate';
  level: string;
  id: string;
  name: string;
  title: string;
  reason: string;
  roas: number | null;
  spend: number;
}

export interface MatchRate {
  total: number;
  matched: number;
  review: number;
  unmatched: number;
  rate: number | null;
}

export interface ReviewLead {
  id: string;
  source: string;
  createdAt: string;
  fbclid: string | null;
  utmContent: string | null;
  matchMethod: string | null;
  confidence: number | null;
}

export interface AdOption {
  id: string;
  name: string;
  adSet: string;
  campaign: string;
}

export interface CreativeInsight {
  dimension: string;
  value: string;
  spend: number;
  leads: number;
  qualifiedLeads: number;
  sales: number;
  revenue: number;
  roas: number | null;
  cpl: number | null;
  costPerQl: number | null;
}

export interface Journey {
  lead: {
    id: string;
    source: string;
    createdAt: string;
    matchMethod: string | null;
    matchStatus: string;
    confidence: number | null;
  };
  ad: { id: string; name: string; adSet: string; campaign: string } | null;
  contact: { id: string; name: string | null } | null;
  deals: Array<{
    id: string;
    canonical: string;
    amount: number | null;
    currency: string | null;
    createdAt: string;
    wonAt: string | null;
  }>;
  touchPoints: Array<{ type: string; occurredAt: string; adId: string | null }>;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (input: { tenantName: string; email: string; password: string; name?: string }) =>
    request<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  me: (token: string) => request<AuthUser>('/me', { token }),
  listClients: (token: string) => request<Client[]>('/clients', { token }),
  createClient: (token: string, name: string) =>
    request<Client>('/clients', { method: 'POST', token, body: JSON.stringify({ name }) }),
  deleteClient: (token: string, id: string) =>
    request<{ ok: boolean }>(`/clients/${id}`, { method: 'DELETE', token }),
  connectMeta: (token: string, input: ConnectMetaInput) =>
    request('/integrations/meta/connect', { method: 'POST', token, body: JSON.stringify(input) }),
  connectBitrix: (token: string, input: ConnectBitrixInput) =>
    request('/integrations/crm/bitrix24/connect', { method: 'POST', token, body: JSON.stringify(input) }),
  listAdAccounts: (token: string) => request<AdAccountDto[]>('/ad-accounts', { token }),
  metaSessionAccounts: (token: string, sessionId: string) =>
    request<{ accounts: Array<{ externalId: string; name: string | null; currency: string }> }>(
      `/integrations/meta/oauth/session/${sessionId}`,
      { token },
    ),
  importMeta: (token: string, sessionId: string, externalIds: string[]) =>
    request<{ imported: number }>('/integrations/meta/import', {
      method: 'POST',
      token,
      body: JSON.stringify({ sessionId, externalIds }),
    }),
  syncAdAccount: (token: string, id: string) =>
    request(`/ad-accounts/${id}/sync`, { method: 'POST', token }),
  deleteAdAccount: (token: string, id: string) =>
    request<{ ok: boolean }>(`/ad-accounts/${id}`, { method: 'DELETE', token }),
  connectAmocrm: (token: string, input: ConnectAmoInput) =>
    request('/integrations/crm/amocrm/connect', { method: 'POST', token, body: JSON.stringify(input) }),
  listCrm: (token: string) => request<CrmConnectionDto[]>('/crm', { token }),
  syncCrm: (token: string, id: string) => request(`/crm/${id}/sync`, { method: 'POST', token }),
  deleteCrm: (token: string, id: string) =>
    request<{ ok: boolean }>(`/crm/${id}`, { method: 'DELETE', token }),
  setFeedback: (token: string, id: string, optIn: boolean) =>
    request<AdAccountDto>(`/ad-accounts/${id}/feedback`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ optIn }),
    }),
  crmStages: (token: string, id: string) => request<Stage[]>(`/crm/${id}/stages`, { token }),
  crmMappings: (token: string, id: string) =>
    request<StageMappingRow[]>(`/crm/${id}/stage-mappings`, { token }),
  setCrmMappings: (token: string, id: string, mappings: StageMappingRow[]) =>
    request<StageMappingRow[]>(`/crm/${id}/stage-mappings`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ mappings }),
    }),
  recommendations: (token: string) =>
    request<{ currency: string; recommendations: Recommendation[] }>('/recommendations', { token }),
  dataTrust: (token: string) => request<MatchRate>('/data-trust', { token }),
  reviewQueue: (token: string) => request<ReviewLead[]>('/review-queue', { token }),
  listAds: (token: string) => request<AdOption[]>('/ads', { token }),
  resolveMatch: (token: string, leadId: string, adId: string) =>
    request<{ ok: boolean }>(`/review-queue/${leadId}/resolve`, {
      method: 'POST',
      token,
      body: JSON.stringify({ adId }),
    }),
  creativeInsights: (token: string, dimension: string) =>
    request<{ currency: string; dimension: string; rows: CreativeInsight[] }>(
      `/creatives/insights?dimension=${dimension}`,
      { token },
    ),
  journey: (token: string, leadId: string) =>
    request<Journey>(`/leads/${leadId}/journey`, { token }),
  performance: (
    token: string,
    opts: { from?: string; to?: string; model?: 'FIRST_TOUCH' | 'LAST_TOUCH' } = {},
  ) => {
    const q = new URLSearchParams();
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    if (opts.model) q.set('model', opts.model);
    return request<{ currency: string; model: string; rows: MetricRow[] }>(
      `/performance?${q.toString()}`,
      { token },
    );
  },
};
