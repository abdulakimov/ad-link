# AdLink — Build Plan (PLAN.md)

> **Source of truth for *what*:** `adprofit.md` (product + spec, decisions locked in §17).
> **This file = *how*:** end-to-end build plan down to files, schema, endpoints, jobs, tasks, and done-criteria.
> Read `adprofit.md §5` (domain), `§8` (matching), `§9` (attribution), `§10` (metrics) alongside this.
> **UI component primitives are chosen AFTER this doc** — frontend sections plan structure only; see §11 + "Open".
>
> **Quality bar: production-ready, NOT MVP.** Every phase ships tested, observable, secure, and tenant-scoped — production concerns are continuous, not a final phase. End state must be world-class: trustworthy numbers, sub-second dashboards, and a "wow" intelligence layer that tells the buyer *which creative actually makes money*. See §15 (production-readiness), §16 (the wow layer), §17 (launch gate).

---

## 0. Locked decisions (from adprofit.md §17)

| Area | Decision |
|---|---|
| Frontend | Next.js (App Router) + shadcn/ui (100%) |
| Backend | Nest.js (TypeScript) |
| DB | PostgreSQL + Prisma ORM |
| Monorepo | pnpm workspaces |
| Jobs | BullMQ (Redis) |
| Click capture | Tracking snippet + landing endpoint (deterministic) |
| Attribution | First + last side-by-side; default 30d click / 1d view; multi-touch later |
| Qualified | CRM-stage based only (per-tenant mapping) |
| Feedback | QualifiedLead + Purchase → Meta CAPI, opt-in per ad account |
| Report currency | Per-tenant, default USD; native stored + dated FX |
| Roadmap | CRM: Bitrix24 → amoCRM/Kommo. Ads: Meta only now (connector stays generic) |

---

## 1. Monorepo layout

```
ad-link-xurshid/
├─ apps/
│  ├─ web/                      # Next.js (App Router) + shadcn
│  │  └─ src/app/...            # routes (see §11)
│  └─ api/                      # Nest.js
│     └─ src/
│        ├─ main.ts
│        ├─ app.module.ts
│        ├─ common/             # guards, interceptors, decorators, filters
│        │  ├─ tenant/          # tenant-scoping middleware + RequestContext
│        │  ├─ rbac/            # roles guard + @Roles()
│        │  └─ crypto/          # secrets vault abstraction
│        ├─ auth/               # login, JWT, sessions
│        ├─ tenants/  users/  clients/
│        ├─ connectors/         # connector SDK + impls
│        │  ├─ connector.interface.ts
│        │  ├─ meta/
│        │  └─ crm/bitrix24/
│        ├─ ingest/             # sync orchestration (BullMQ producers)
│        ├─ matching/           # identity resolution engine
│        ├─ attribution/        # models + cohort
│        ├─ aggregation/        # metric materialization
│        ├─ conversions/        # Meta CAPI feedback loop
│        ├─ capture/            # click-capture landing endpoint
│        └─ api/                # read endpoints for the web app
├─ packages/
│  ├─ core/                     # canonical types, enums, connector interface, money/phone utils
│  └─ db/                       # prisma schema + client + migrations + seed
├─ pnpm-workspace.yaml
├─ docker-compose.yml           # postgres + redis
├─ .env.example
├─ tsconfig.base.json
├─ adprofit.md
└─ PLAN.md
```

**Why `packages/core`:** the canonical model, enums, and the connector interface are shared by `api` (impl) and `web` (types for tables). Single definition, no drift.

---

## 2. Environment & config

`.env.example` (names only — never commit values):

```
# core
DATABASE_URL=postgresql://adlink:adlink@localhost:5432/adlink
REDIS_URL=redis://localhost:6379
APP_SECRET=                      # JWT signing
ENCRYPTION_KEY=                  # 32-byte key for credential encryption at rest
WEB_ORIGIN=http://localhost:3000

# meta
META_APP_ID=
META_APP_SECRET=
META_API_VERSION=v21.0          # verify latest at build time
META_REDIRECT_URI=

# fx
FX_PROVIDER_API_KEY=            # dated rates (e.g. exchangerate.host / openexchangerates)
```

`docker-compose.yml`: `postgres:16`, `redis:7`. Volumes for both.
Secrets vault: start with a `CryptoService` (AES-256-GCM via `ENCRYPTION_KEY`) behind a `SecretsVault` interface so a real KMS/Vault swaps in later. `ponytail: encrypted column now, KMS when a second env needs shared rotation.`

---

## 3. Data model (Prisma schema — `packages/db/prisma/schema.prisma`)

> Every tenant-scoped table carries `tenantId` and is indexed on it. All external-id upserts are unique to guarantee idempotent re-sync. Money = `amount` + `currency`; conversions via `FxRate`, never stored pre-mixed.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// ---------- enums ----------
enum Role            { OWNER ADMIN BUYER CLIENT }
enum AdProvider      { META GOOGLE TIKTOK }
enum CrmProvider     { BITRIX24 AMOCRM HUBSPOT SALESFORCE }
enum CanonicalStatus { LEAD QUALIFIED WON LOST IGNORE }
enum LeadSource      { META_LEAD_AD WEBSITE DM CRM }
enum IdentifierType  { PHONE EMAIL }
enum TouchType       { IMPRESSION CLICK LEAD }
enum MatchMethod     { LEADGEN_ID FBCLID PHONE EMAIL UTM FUZZY MANUAL }
enum MatchStatus     { MATCHED UNMATCHED REVIEW REJECTED }
enum AttributionModel{ FIRST_TOUCH LAST_TOUCH LINEAR TIME_DECAY POSITION }
enum ConversionType  { LEAD QUALIFIED_LEAD PURCHASE }
enum ConversionState { PENDING SENT ACCEPTED REJECTED }
enum SyncState       { OK RUNNING FAILED }

// ---------- tenancy ----------
model Tenant {
  id          String   @id @default(cuid())
  name        String
  reportCurrency String @default("USD")
  createdAt   DateTime @default(now())
  users       User[]
  clients     Client[]
}

model User {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  email     String
  passwordHash String
  role      Role     @default(BUYER)
  clientId  String?  // CLIENT role is scoped to one client
  createdAt DateTime @default(now())
  @@unique([email])
  @@index([tenantId])
}

model Client {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name      String
  adAccounts AdAccount[]
  crmConnections CrmConnection[]
  @@index([tenantId])
}

// ---------- connections ----------
model AdAccount {
  id         String   @id @default(cuid())
  tenantId   String
  clientId   String
  client     Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  provider   AdProvider @default(META)
  externalId String   // act_<id>
  name       String?
  currency   String
  timezone   String
  tokenRef   String   // pointer into secrets vault
  feedbackOptIn Boolean @default(false)   // §17 feedback opt-in
  lastSyncAt DateTime?
  syncState  SyncState @default(OK)
  campaigns  Campaign[]
  @@unique([provider, externalId])
  @@index([tenantId]) @@index([clientId])
}

model CrmConnection {
  id         String   @id @default(cuid())
  tenantId   String
  clientId   String
  client     Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  provider   CrmProvider
  externalRef String  // portal/base url or account id
  authRef    String   // secrets vault pointer
  revenueField String?     // which deal field holds amount
  revenueCurrencyField String?
  lastSyncAt DateTime?
  syncState  SyncState @default(OK)
  stageMappings StageMapping[]
  @@unique([provider, externalRef])
  @@index([tenantId]) @@index([clientId])
}

model StageMapping {
  id            String @id @default(cuid())
  tenantId      String
  crmConnectionId String
  crm           CrmConnection @relation(fields: [crmConnectionId], references: [id], onDelete: Cascade)
  externalStageId String       // CRM stage id
  externalStageName String
  canonical     CanonicalStatus
  @@unique([crmConnectionId, externalStageId])
  @@index([tenantId])
}

// ---------- ad hierarchy ----------
model Campaign {
  id          String   @id @default(cuid())
  tenantId    String
  adAccountId String
  adAccount   AdAccount @relation(fields: [adAccountId], references: [id], onDelete: Cascade)
  externalId  String
  name        String
  status      String?
  adSets      AdSet[]
  @@unique([adAccountId, externalId])
  @@index([tenantId])
}

model AdSet {
  id         String @id @default(cuid())
  tenantId   String
  campaignId String
  campaign   Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  externalId String
  name       String
  status     String?
  ads        Ad[]
  @@unique([campaignId, externalId])
  @@index([tenantId])
}

model Ad {
  id         String @id @default(cuid())
  tenantId   String
  adSetId    String
  adSet      AdSet  @relation(fields: [adSetId], references: [id], onDelete: Cascade)
  externalId String
  name       String
  status     String?
  creativeId String?
  creative   Creative? @relation(fields: [creativeId], references: [id])
  insights   AdInsightDaily[]
  leads      Lead[]
  touchPoints TouchPoint[]
  @@unique([adSetId, externalId])
  @@index([tenantId])
}

model Creative {
  id        String @id @default(cuid())
  tenantId  String
  externalId String?
  name      String?
  // parsed naming convention (e.g. Vid1-h1-c1)
  video     String?
  hook      String?
  concept   String?
  angle     String?
  format    String?
  audience  String?
  tags      String[]
  ads       Ad[]
  @@index([tenantId])
}

model AdInsightDaily {
  id         String @id @default(cuid())
  tenantId   String
  adId       String
  ad         Ad     @relation(fields: [adId], references: [id], onDelete: Cascade)
  date       DateTime @db.Date     // in ad-account timezone
  spend      Decimal @db.Decimal(18,6)
  currency   String
  impressions Int
  clicks     Int
  reach      Int?
  frequency  Decimal? @db.Decimal(10,4)
  // ctr/cpm/cpc are computed on read; store only raw
  @@unique([adId, date])
  @@index([tenantId]) @@index([date])
}

// ---------- identity / outcomes ----------
model Contact {
  id        String @id @default(cuid())
  tenantId  String
  name      String?
  identifiers ContactIdentifier[]
  leads     Lead[]
  deals     Deal[]
  @@index([tenantId])
}

model ContactIdentifier {
  id        String @id @default(cuid())
  tenantId  String
  contactId String
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  type      IdentifierType
  normalized String   // E.164 phone OR lowercased email
  hash      String     // sha256(normalized) for Meta CAPI user_data
  @@unique([tenantId, type, normalized])
  @@index([normalized]) @@index([tenantId])
}

model Lead {
  id          String   @id @default(cuid())
  tenantId    String
  contactId   String?
  contact     Contact? @relation(fields: [contactId], references: [id])
  source      LeadSource
  externalId  String?  // CRM lead id
  leadgenId   String?  // Meta lead form id (deterministic)
  fbclid      String?
  utmSource   String?  utmMedium String?  utmCampaign String?  utmContent String?  utmTerm String?
  createdAt   DateTime
  // attribution edge
  adId        String?
  ad          Ad?      @relation(fields: [adId], references: [id])
  matchMethod MatchMethod?
  matchStatus MatchStatus @default(UNMATCHED)
  confidence  Float?     // 0..1
  deals       Deal[]
  touchPoints TouchPoint[]
  @@unique([source, externalId])
  @@index([tenantId]) @@index([leadgenId]) @@index([fbclid]) @@index([matchStatus])
}

model Deal {
  id          String   @id @default(cuid())
  tenantId    String
  contactId   String?
  contact     Contact? @relation(fields: [contactId], references: [id])
  leadId      String?
  lead        Lead?    @relation(fields: [leadId], references: [id])
  externalId  String
  stageExternalId String
  canonical   CanonicalStatus
  amount      Decimal? @db.Decimal(18,2)
  currency    String?
  createdAt   DateTime
  wonAt       DateTime?
  @@unique([tenantId, externalId])
  @@index([tenantId]) @@index([canonical])
}

model TouchPoint {
  id        String   @id @default(cuid())
  tenantId  String
  contactId String?
  leadId    String?
  lead      Lead?    @relation(fields: [leadId], references: [id])
  adId      String?
  ad        Ad?      @relation(fields: [adId], references: [id])
  type      TouchType
  occurredAt DateTime
  isFirst   Boolean @default(false)
  isLast    Boolean @default(false)
  @@index([tenantId]) @@index([contactId]) @@index([occurredAt])
}

model ConversionEvent {
  id          String   @id @default(cuid())
  tenantId    String
  adAccountId String
  type        ConversionType
  eventId     String   // stable dedup id sent to Meta
  leadgenId   String?
  value       Decimal? @db.Decimal(18,2)
  currency    String?
  state       ConversionState @default(PENDING)
  response    Json?    // accepted/rejected payload for audit
  sentAt      DateTime?
  createdAt   DateTime @default(now())
  @@unique([eventId])
  @@index([tenantId]) @@index([state])
}

model MatchAudit {
  id        String   @id @default(cuid())
  tenantId  String
  leadId    String
  method    MatchMethod
  confidence Float
  resolvedBy String   // "engine" | userId
  detail    Json
  createdAt DateTime @default(now())
  @@index([tenantId]) @@index([leadId])
}

model FxRate {
  id       String   @id @default(cuid())
  base     String
  quote    String
  date     DateTime @db.Date
  rate     Decimal  @db.Decimal(18,8)
  @@unique([base, quote, date])
}

model SyncRun {
  id        String   @id @default(cuid())
  tenantId  String
  kind      String   // "meta_insights" | "bitrix_deals" | ...
  state     SyncState
  windowStart DateTime?
  windowEnd   DateTime?
  startedAt DateTime @default(now())
  finishedAt DateTime?
  error     String?
  @@index([tenantId]) @@index([kind])
}
```

**Materialized metrics:** start with a Postgres **materialized view** `metric_daily` keyed `(tenantId, adId, date, attributionModel)` computing leads/QL/sales/revenue per ad/day; refresh after each aggregation run. Roll up adset/campaign on read. `ponytail: matview now; ClickHouse only when row counts force it (§17 deferred).`

---

## 4. Connector SDK (`apps/api/src/connectors/connector.interface.ts`)

One interface, every provider implements it. Business logic never sees Meta/Bitrix field names.

```ts
interface AdConnector {
  fetchAdHierarchy(acc: AdAccountRef): Promise<RawHierarchy>;     // campaigns→adsets→ads→creatives
  fetchInsights(acc: AdAccountRef, range: DateRange): Promise<RawInsight[]>; // daily, ad-level
  fetchLeads?(acc: AdAccountRef, since: Date): Promise<RawLead[]>; // lead ads
  pushConversion?(acc: AdAccountRef, ev: ConversionPayload): Promise<PushResult>;
  subscribeWebhooks?(acc: AdAccountRef): Promise<void>;
}

interface CrmConnector {
  fetchStages(conn: CrmRef): Promise<RawStage[]>;
  fetchLeads(conn: CrmRef, since: Date): Promise<RawCrmLead[]>;
  fetchDeals(conn: CrmRef, since: Date): Promise<RawDeal[]>;
  fetchContacts(conn: CrmRef, since: Date): Promise<RawContact[]>;
  subscribeWebhooks?(conn: CrmRef): Promise<void>;
}
```

Each connector exposes a `normalize()` that maps `Raw*` → canonical create/update inputs. Registry resolves provider → impl.

---

## 5. Sync pipeline (BullMQ)

Queues: `meta-sync`, `crm-sync`, `matching`, `aggregation`, `conversions`, `webhooks`.

| Stage | Trigger | Idempotency |
|---|---|---|
| Ingest | cron (insights hourly for recent; nightly 28d reconcile) + webhooks | upsert on `@@unique` external ids |
| Normalize | inline in connector `normalize()` | pure transform |
| Identity resolution | after ingest, per new/changed lead | re-runnable; writes MatchAudit |
| Aggregation | after matching | refresh matview; deterministic |
| Feedback | after matching, if opt-in | `ConversionEvent.eventId` dedup |
| Reconcile | nightly | re-pull trailing window, re-upsert |

Rules: every job retryable w/ exponential backoff; failed webhooks → dead-letter queue; each run logs a `SyncRun`. Re-running must never double-count (enforced by unique constraints + upserts).

---

## 6. Matching engine (`matching/` — invest here, adprofit.md §8)

Order, first confident hit wins, record `MatchAudit`:

1. `leadgenId` (Meta lead ad) → **1.0 deterministic**
2. `fbclid` (captured on landing, §10) → **1.0 deterministic**
3. phone E.164 → **~0.95**
4. email normalized → **~0.9**
5. UTM (campaign/adset granularity, not ad) → **~0.5, REVIEW**
6. name + time proximity → **weak, REVIEW only**

- Confidence < threshold → `matchStatus = REVIEW`, never counted in revenue until resolved.
- Dedup: collapse same human (Meta lead + CRM lead + contact) into one `Contact` via `ContactIdentifier` unique keys.
- Conflict (lead matches 2 ads): defer to attribution model, don't guess.
- Expose **account match rate** = % of CRM revenue attributable to an ad.

**Tests (fixtures):** lead-ad direct; website lead w/ fbclid; phone-only; email-only; duplicate person; two-ad conflict; unmatched; retroactive CRM stage change.

---

## 7. Attribution engine (`attribution/` — adprofit.md §9)

- Compute **first-touch AND last-touch** for every lead from `TouchPoint`s; store both, show side-by-side.
- Window: default **30d click / 1d view**, per-tenant configurable.
- **Cohort/vintage:** attribute revenue to the spend that *generated the lead* (lead-created date), not close date. Report: "leads from ad X in week N → Y% purchased so far → ROAS".
- Reconcile vs Meta's own numbers: show both, labeled, don't claim equality.
- Multi-touch (linear/time-decay) = deferred, interface ready.

---

## 8. Metrics (`aggregation/` — adprofit.md §10)

Per Ad / AdSet / Campaign / total, any date range:

```
CPL          = spend / leads
QL Rate      = qualifiedLeads / leads
CostPerQL    = spend / qualifiedLeads
CAC          = spend / sales
Revenue      = Σ won deal amounts (→ report currency via FxRate@date)
ROAS         = revenue / spend
ARPL         = revenue / leads
ConvRate     = sales / leads   (also sales / QL)
CycleTime    = avg(wonAt − lead.createdAt)
CTR/CPM/CPC  = computed from raw insight rows
```

Money: every cross-currency sum converts each row at its **dated** FX rate first. Round only at display.

---

## 9. API surface (`api/` — Nest, all tenant-scoped + RBAC)

```
POST  /auth/login
GET   /me
# settings
POST  /clients               GET /clients
POST  /integrations/meta/oauth/callback
POST  /integrations/crm/bitrix24/connect
GET   /crm/:id/stages        PUT /crm/:id/stage-mappings
PUT   /ad-accounts/:id/feedback   # opt-in toggle
PUT   /tenant/settings           # report currency, attribution defaults
# data
GET   /performance?level=ad|adset|campaign&from&to&model=first|last
GET   /leads/:id/journey
GET   /creatives/insights
GET   /data-trust            # match rate, unmatched, last sync
GET   /review-queue          POST /review-queue/:leadId/resolve
# capture (public, signed)
POST  /capture               # fbclid/UTM landing beacon
# webhooks (public, verified)
POST  /webhooks/meta/leadgen
POST  /webhooks/crm/bitrix24
```

Cross-cutting: `TenantMiddleware` sets request tenant from JWT; a Prisma extension/guard asserts `tenantId` on every query (defense in depth); `@Roles()` guard for RBAC; CLIENT role further scoped to its `clientId`.

---

## 10. Click-capture (`capture/`)

- `packages` ships a tiny JS snippet the client embeds: reads `fbclid` + UTMs from URL, POSTs to `/capture` with a tenant key, sets a first-party cookie, and forwards the id into the CRM lead (hidden field / API).
- `/capture` is rate-limited, validates the tenant key, stores a `TouchPoint(type=CLICK)` + pending identifier so the later CRM lead resolves deterministically by `fbclid`.

---

## 11. Frontend (Next.js App Router + shadcn)

> **Design language: see `DESIGN.md`** — tokens (indigo/zinc, light+dark), Geist typography, button spec + icon rules, all component primitives, states, motion, number/locale formatting, a11y. Calm minimal · airy chrome + compact tables · elevation over borders · radius 10px.

Routes (Next App Router):

```
/login
/(app)/overview
/(app)/performance              # centerpiece table, drill-down ad↔revenue
/(app)/leads/[id]               # journey timeline
/(app)/creatives                # creative-dimension insights
/(app)/data-trust               # match rate + review queue
/(app)/settings/integrations    # connect Meta + CRM
/(app)/settings/stage-mapping   # map CRM stages → canonical, pick revenue field
/(app)/settings/attribution     # model + window
/(app)/settings/team            # RBAC
```

**UI primitives (locked):** shadcn/ui (100%) · **TanStack Table + TanStack Virtual** for the performance grid (virtualized, server sort/pagination, campaign→adset→ad tree drill-down, ROAS/CPQL heatmap cells) · **Recharts** via shadcn charts · **TanStack Query** for server-state (cache, refetch, optimistic, background freshness) · forms = react-hook-form + zod · icons = lucide · date-range = shadcn Calendar (react-day-picker). Global date-range + attribution-model selectors; quality-vs-volume emphasis (CPL **and** CostPerQL **and** ROAS together).

---

## 12. Security & multi-tenancy (adprofit.md §13)

- Tenant scoping on **every** query (middleware + Prisma guard). CLIENT sees only its client.
- PII (phone/email) encrypted at rest; **hashed before any send to Meta**.
- OAuth/system tokens in secrets vault, least-privilege scopes (`ads_read`, `leads_retrieval`, `ads_management` only if pushing).
- Full audit (MatchAudit, ConversionEvent.response, SyncRun); per-tenant data deletion; webhook signature verification.

---

## 13. Testing strategy

- **Unit:** matching (all fixtures §6), attribution (first/last/cohort/time-lag), money/FX conversion, phone/email normalization, creative-name parser.
- **Integration:** connector `normalize()` against recorded raw payloads; idempotent re-sync (run twice → identical state); webhook dedup.
- **E2E (later):** connect → sync → see performance table.
- Per ponytail: one runnable check accompanies each non-trivial unit; no framework sprawl.

---

## 14. Build phases (granular — each independently shippable)

**Definition of Done — applies to EVERY phase (production-ready, not "later"):**
- Unit + integration tests for new logic, green in CI
- Errors handled + structured-logged; external calls retried w/ backoff
- Tenant-scoping enforced + a test proving cross-tenant access fails
- Metrics/traces emitted; the new flow is visible in the ops dashboard
- No secret in code/DB plaintext; PII path reviewed
- i18n keys (no hardcoded user strings); a11y on new UI
- Docs/changelog updated

### Phase 0 — Repo & tooling
- [ ] pnpm workspace, `tsconfig.base.json`, eslint/prettier
- [ ] `docker-compose.yml` (postgres 16 + redis 7), `.env.example`
- [ ] `packages/db` Prisma init; `apps/api` Nest init; `apps/web` Next init
- [ ] **GitHub Actions CI** (lint → typecheck → test → build) on every PR
- **Done:** `pnpm i` + `docker compose up` + `prisma migrate dev` work; api & web boot; CI green.

### Phase 1 — Foundations
- [ ] Full Prisma schema (§3) + first migration + seed (demo tenant)
- [ ] Auth (JWT login), `Tenant`/`User`, RBAC guard, tenant middleware + Prisma scoping extension
- [ ] `CryptoService` + `SecretsVault` interface
- [ ] BullMQ wiring, base worker + scheduler, `SyncRun` logging
- [ ] **Observability skeleton:** pino structured logs, Sentry, OpenTelemetry, `/health` + `/ready`
- [ ] **i18n skeleton** (uz/ru/en) + Swagger/OpenAPI for the API
- **Done:** register tenant+user, login, RBAC enforced, sample job runs, every query tenant-scoped (test proves cross-tenant read fails); errors land in Sentry; `/health` green.

### Phase 2 — Meta read
- [ ] Meta OAuth/system-user token → vault; `MetaConnector`
- [ ] `fetchAdHierarchy` + `fetchInsights` (daily, ad-level, account TZ/currency); creative-name parser
- [ ] Trailing-window (28d) idempotent sync job
- **Done:** connected account syncs hierarchy + daily insights; re-run = no dupes; currency/TZ respected.

### Phase 3 — Bitrix24 read + stage mapping
- [ ] `Bitrix24Connector` (REST): stages, leads, deals, contacts; deal amount+currency
- [ ] CRM webhooks (`ONCRMLEADUPDATE`/`ONCRMDEALUPDATE`), idempotent
- [ ] Stage-mapping config API + UI; revenue-field picker
- **Done:** CRM data synced; tenant maps stages→canonical without code; remap without data loss.

### Phase 4 — Matching engine v1 + click capture
- [ ] Normalizers (phone E.164, email, fbclid/UTM, creative name)
- [ ] Deterministic match chain + `MatchAudit` + confidence + dedup
- [ ] Review queue for low-confidence; match-rate metric
- [ ] Click-capture snippet + `/capture` endpoint
- **Done:** lead ads ~100% attributed; website leads via fbclid when snippet present; match rate exposed; unmatched queued. Fixtures green.

### Phase 5 — Metrics + performance table
- [ ] `metric_daily` matview + FX conversion + cohort-by-lead-date
- [ ] `/performance` API (range, model, drill-down)
- [ ] Performance table UI (primitives TBD)
- **Done:** table shows full §10 set per ad/adset/campaign, multi-currency, sortable, drill-down.

### Phase 6 — Attribution + cohort
- [ ] First/last side-by-side from TouchPoints; lookback windows; vintage ROAS views
- **Done:** toggle first/last; cohort report renders ("week N leads → X% bought → ROAS").

### Phase 7 — Feedback loop (CAPI)
- [ ] Emit QualifiedLead + Purchase, opt-in per account, hashed user_data, `eventId` dedup, Conversion Leads path for lead ads
- [ ] Audit log (sent/accepted/rejected)
- **Done:** opt-in account sends QL+Purchase, deduped, audited.

### Phase 8 — Trust & insight UIs
- [ ] Lead journey timeline; creative-dimension aggregation; data-trust panel; manual-match resolution UI
- **Done:** all four views functional.

### Phase 9 — amoCRM/Kommo
- [ ] `AmoConnector` via same interface (proves abstraction)
- **Done:** second CRM works end-to-end with no core changes.

### Phase 10 — Hardening & scale
- [ ] Threshold alerts; structured logging/metrics/tracing; rate-limit/backoff/DLQ audit; columnar-store eval
- **Done:** ops dashboards (freshness/failures/match rate) live; load-tested.

### Phase 11 — Launch readiness (world-class gate)
- [ ] Security review / pen-test pass; dependency audit clean
- [ ] Load test at target scale (millions of insight rows / leads) within latency budget
- [ ] DR drill: restore from backup; RPO/RTO documented
- [ ] Accessibility (WCAG AA) + i18n (uz/ru/en) complete
- [ ] Onboarding wizard, empty/error/loading states, polish pass
- [ ] Billing live; per-tenant data export + hard delete verified
- **Done:** a new agency self-onboards, connects Meta+CRM, maps stages, and **trusts the numbers within minutes — no engineer in the loop.**

---

## 15. Production-readiness & operations (the bar that makes it "ready, not MVP")

- **Environments & CI/CD:** dev / staging / prod. GitHub Actions: lint → test → build → migrate → deploy. Preview env per PR. Prod migrations gated + **zero-downtime (expand→migrate→contract)**, never destructive in one step.
- **Hosting:** managed Postgres (Neon/RDS) + managed Redis; `web` on Vercel; `api` + workers as containers (Fly/Render/ECS). `ponytail: managed services, not self-run k8s until scale truly demands it.`
- **Observability (cross-cutting, from Phase 1 — not Phase 10):** structured JSON logs (pino), error tracking (Sentry), OpenTelemetry traces + metrics, `/health` + `/ready`. Ops dashboard: sync freshness, match rate, queue depth, API latency. **Alerts** (Slack/PagerDuty) on sync failure, freshness-SLA breach, DLQ growth, error-rate spike.
- **Reliability (cross-cutting):** per-provider token-bucket throttle (Meta rate limits are aggressive), exponential backoff + jitter, **circuit breaker** per connector, idempotent upserts everywhere, **dead-letter queue + replay UI**, webhook signature verify + dedup, graceful degradation (serve stale data clearly labeled rather than erroring).
- **Performance & scale:** cursor pagination everywhere; dashboards read matview + **Redis cache (short TTL)** → sub-second; query budgets/timeouts; incremental matview refresh; partition `AdInsightDaily` by month at volume; ClickHouse swap-in when rows force it (interface ready). `ponytail: matview + cache first; columnar only when measured.`
- **Data lifecycle:** automated backups + PITR; per-tenant **export + hard delete** (GDPR); per-tenant retention policy; PII encrypted at rest, hashed before any Meta send.
- **Compliance & privacy:** capture-snippet consent; least-privilege OAuth scopes; DPA-ready audit trail.

## 16. World-class / "wow" layer (the differentiator, not decoration)

- **Centerpiece performance table:** virtualized + server-paginated (fast at scale); **ROAS / cost-per-qualified-lead heatmap** conditional formatting; saved views + column chooser; first-touch vs last-touch side-by-side; inline sparklines; **bulk creative tagging** inline; sticky drill-down (campaign→adset→ad).
- **Intelligence & recommendations (the real wow):** auto-surface *scale this / pause that* — "cheap leads, zero sales" detector; quality-drop alert on a scaling ad; best creative **hook/concept/angle** ranking; opportunity finder. **Rule-based + explainable first**, ML later. `ponytail: explainable rules ship the wow; ML only when rules plateau.`
- **Trust as a feature (the moat):** every attributed dollar shows its match basis ("matched by phone, 99%"); account-level match rate; **reconcile-vs-Meta** panel that labels methodology differences instead of hiding them.
- **Near-real-time:** webhook-driven updates; live sync-status + freshness indicator (SSE); optimistic UI.
- **Onboarding wizard:** connect Meta → connect CRM → map stages → first dashboard in minutes; show demo data while the first sync runs so the screen is never empty.
- **Reporting & sharing:** CSV/PDF export; scheduled email reports; shareable **read-only client view**.
- **Design polish:** design tokens, dark mode, crafted empty/loading/error states, micro-interactions, responsive. (Primitives chosen next.)
- **i18n & locale:** uz / ru / en from day 1; locale-aware currency, number, date, timezone.

## 17. Open / next decision
- **UI component primitives — LOCKED:** shadcn/ui + TanStack Table/Virtual (grid) + Recharts (charts) + TanStack Query (server-state); react-hook-form+zod forms, lucide icons, shadcn date-range.
- ORM confirmed Prisma (vetoable).
- Deferred (interfaces ready, NOT built — wow ≠ bloat): multi-touch ML models · ClickHouse · Google/TikTok · HubSpot/Salesforce · rule-based qualification · ML recommendations.
