# AdLink — Product & Technical Specification

> Working name: **AdLink** (rename freely).
> Audience: this document is written to be handed directly to **Claude Code** as the source-of-truth spec for building the product. It is intentionally explicit about the domain model, data flows, the matching/attribution algorithm, and non-functional ("world-class") requirements.
> Status: this is a full product spec, **not an MVP scope**. A suggested build sequence is included at the end so work can be staged without cutting the vision.

---

## 1. Overview & Problem Statement

**AdLink is a SaaS for performance marketers / media buyers ("targetologists") that connects Meta Ads with the client's CRM (Bitrix24, amoCRM/Kommo, and others) and matches ad data to CRM sales data, so the marketer can see — at the campaign, ad set, and individual ad level — not just how many leads each ad produced, but how many of those leads became *qualified leads* and *actual paying customers*, and at what cost.**

The core pain: Meta optimizes toward whatever signal it's given. If the only signal is "lead submitted", Meta (and the marketer) will scale ad sets that produce **cheap leads**, even when those leads never buy. The marketer ends up doubling down on low-quality traffic because the real outcome — revenue — is invisible at the ad level.

AdLink makes revenue and lead-quality visible per ad, and (critically) **feeds that outcome back to Meta** so the algorithm can optimize toward qualified leads and sales instead of cheap leads.

### The thesis in one sentence
> Spend (Meta) + Outcomes (CRM) → matched at the ad level → turned into true unit economics → fed back to Meta to optimize for revenue.

---

## 2. Goals & Non-Goals

### Goals
- Pull campaign / ad set / ad performance from Meta and join it to CRM outcomes (lead, qualified lead, won deal, revenue) **deterministically at the ad level**.
- Compute true unit economics per ad / ad set / campaign: cost per lead, cost per **qualified** lead, cost per sale, revenue, ROAS, CAC, ARPL, conversion rate, deal cycle time.
- Let each client **map their own CRM pipeline** to canonical statuses (Lead / Qualified / Won / Lost) and define where "revenue" lives — without code changes.
- Close the loop: report qualified-lead and purchase events back to Meta (Conversions API / Conversion Leads) so campaigns can optimize on quality, not volume.
- Be **source-agnostic and connector-based** so new ad platforms (Google, TikTok) and new CRMs can be added without rewriting the core.

### Non-Goals (for now, but design so they're not blocked)
- Building a CRM (we integrate, we don't replace).
- Building an ad-buying/campaign-management UI inside Meta (we read and report; write is limited to conversion events).
- Generic BI / arbitrary dashboards — the product is opinionated around the ad↔revenue join.

---

## 3. Target Users & Roles

- **Agency owner / admin** — connects integrations, manages clients (tenants), billing, team.
- **Targetologist / media buyer** — the primary daily user; reads dashboards, drills into ads, manages creative tagging.
- **Client (read-only)** — the business whose ads are being run; sees their own results only.

The product is **multi-tenant**: one agency manages many clients; one client has one or more Meta ad accounts and one or more CRM connections. RBAC must enforce strict tenant isolation.

---

## 4. Core Concept (how the join actually works)

There are **two fundamentally different lead paths** and the matching engine must handle both:

1. **Meta Lead Ads (Instant Forms).** The lead is created *inside* Meta. Meta's webhook + Lead API returns the lead's field data (name/phone/email) **together with `ad_id`, `adset_id`, `campaign_id`**. → Ad attribution is **direct/deterministic** here. The only remaining job is to find this same person in the CRM (by phone/email/lead_id) to learn their qualification status and revenue.

2. **Traffic / website / conversion campaigns.** The user clicks an ad (URL carries `fbclid` + UTMs), lands on a site or funnel, and submits a form or writes in DM. The CRM lead must carry back the ad context. → Attribution depends on **capturing `fbclid`/UTMs at the click/landing step** and storing them on the lead, *or* matching the CRM lead back to a Meta click via identifiers.

So matching happens on a priority of keys (most to least reliable):

| Priority | Key | Reliability |
|---|---|---|
| 1 | Meta `leadgen_id` / lead form id | Deterministic |
| 2 | `fbclid` (click id) captured on landing → stored on CRM lead | Deterministic |
| 3 | Normalized phone number (E.164) | Strong |
| 4 | Email (normalized/hashed) | Strong |
| 5 | UTM parameters (campaign/content/term) on the lead | Coarse (campaign/adset level, not always ad) |
| 6 | Name + timestamp proximity (fuzzy) | Weak — review queue only |

**Qualification & revenue are owned by the CRM**, not by Meta. The product must let each tenant configure: which CRM stage(s) mean "Qualified", which mean "Won/Sale", which mean "Lost", and which field holds the deal amount (+ its currency). Their pipelines are custom (e.g., Uzbek-language Bitrix24 stages like *Sifatli Lid*, *Sifatsiz Lid*, *Keldi – Zoom – Uchrashuv*), so this mapping is **per-tenant configuration**.

### Worked example (the user's own example, formalized)
Campaign 1 contains Ad sets 1/2/3; each ad set has 3 ads. Yesterday Campaign 1 spent **$30** and produced **30 leads**. AdLink must, for that campaign *and each ad set and each ad*, resolve from the CRM:
- how many of those 30 leads became **qualified**,
- how many were marked **unqualified**,
- how many became **sales**,
- cost per qualified lead, cost per sale, total revenue, ROAS —
all attributed down to the **individual ad** that generated each lead. That is the deliverable that tells the targetologist *which creative actually makes money*, not just which makes cheap leads.

---

## 5. Domain Model (canonical, source-agnostic)

Store everything in canonical entities. Each integration maps its own objects into these. Never hardcode Meta/Bitrix field names into business logic.

- **Tenant** — an agency account. Has Users, Clients, billing.
- **User** — belongs to a Tenant, has a Role.
- **Client** — a business under a Tenant. Has AdAccounts and CrmConnections.
- **AdAccount** — a connected Meta ad account (id, currency, timezone, token ref).
- **CrmConnection** — a connected CRM (provider, auth ref, base url/portal, stage mapping config).
- **Campaign / AdSet / Ad** — canonical ad hierarchy (external ids + provider). Ad also links to **Creative**.
- **Creative** — the actual asset/copy; supports **naming-convention parsing** (e.g., `Vid1-h1-c1` → video=1, hook=1, concept=1) and free-form tags (angle, format, audience).
- **AdInsightDaily** — daily metrics per Ad (spend, impressions, clicks, CTR, CPM, CPC, frequency, reach), in account currency + converted.
- **Contact** — a person (normalized phone(s), email(s), name), deduplicated across sources.
- **Lead** — a lead record sourced from Meta and/or CRM, linked to a Contact, carrying source identifiers (`leadgen_id`, `fbclid`, UTMs), created_at, and a resolved link to an Ad (with match method + confidence).
- **Deal** — a CRM opportunity linked to a Contact/Lead: stage, canonical status (Lead/Qualified/Won/Lost), amount, currency, created_at, won_at.
- **TouchPoint** — an ad interaction in the customer journey (impression/click/lead), timestamped, with first-/last-touch flags. Enables multi-touch attribution.
- **ConversionEvent** — an outcome (Lead, QualifiedLead, Purchase) to be (a) reported in analytics and (b) sent back to Meta via CAPI. Carries the keys needed for Meta matching and an idempotency/dedup id.
- **MatchAudit** — record of how a Lead↔Ad or Lead↔Deal link was made (key used, confidence, who/what resolved it), for trust and debugging.

Relationships: Ad → many Leads; Lead ↔ one Contact; Contact → many Deals; Deal → canonical status + amount; Lead → resolved Ad (the attribution edge).

---

## 6. Integrations

> Claude Code: treat each integration as a **pluggable connector** behind a shared interface (`fetchAdHierarchy`, `fetchInsights`, `fetchLeads`, `fetchDeals`, `fetchStages`, `pushConversion`, `subscribeWebhooks`). Verify exact endpoint names/fields against current official docs at build time — these APIs change and versions matter.

### 6.1 Meta Marketing API (read)
- **Auth:** Meta App + OAuth (System User token for long-lived access). Store the token in a secrets vault, never in the app DB in plaintext. Use least-privilege scopes (`ads_read`, `leads_retrieval`, `business_management`, and `ads_management` only if pushing conversions).
- **Hierarchy:** pull Campaigns → Ad Sets → Ads → Creatives with their ids, names, status.
- **Insights:** pull daily insights at the **ad level** (spend, impressions, clicks, ctr, cpm, cpc, frequency, reach). Respect the **account's timezone and currency** (Meta reports in account TZ/currency).
- **Lead Ads:** subscribe to `leadgen` webhooks; on event, fetch field data via the lead id. The lead payload includes `ad_id`/`adset_id`/`campaign_id` → store as a deterministic touchpoint.
- **Retroactive change handling:** Meta insights and attribution are **not final on day 1** (late conversions, attribution windows up to 7-day click / 1-day view). Re-sync a **trailing window (e.g., last 28 days)** on every run and **idempotently upsert**.

### 6.2 CRM connectors (read) — Bitrix24 first, amoCRM/Kommo second
- **Bitrix24:** REST via inbound webhook or OAuth app. Pull leads, deals, contacts; pull pipeline **stages** (`crm.status.*`, deal category stages); deal amount + currency. Subscribe to CRM webhooks (`ONCRMLEADUPDATE`, `ONCRMDEALUPDATE`) for near-real-time status changes.
- **amoCRM / Kommo:** OAuth2; leads, contacts, **pipelines/statuses**, custom fields, webhooks.
- **Stage mapping (per tenant):** a configuration UI maps each CRM stage to a canonical status (Lead / Qualified / Won / Lost / ignore) and selects the **revenue field** and its currency. This is mandatory and must support re-mapping without data loss.

### 6.3 Meta Conversions API (write — the feedback loop)
- Report outcome events back to Meta: **QualifiedLead** and **Purchase** (and optionally Lead), so Meta can optimize for quality.
- For **Lead Ads**, use Meta's **Conversion Leads / CRM** path keyed by the original `leadgen_id` (report lead stage progression and value back).
- For non-lead-ad paths, send CAPI events with hashed `user_data` (phone/email) + available click identifiers, with correct `action_source` and a stable `event_id` for **deduplication**.
- This must be **opt-in per ad account**, configurable, and fully auditable (what we sent, when, accepted/rejected).

---

## 7. Data Pipeline & Sync Strategy

1. **Ingestion** — connectors pull on a schedule (insights: at least hourly for recent days; nightly full trailing-window reconcile) + react to webhooks (new leads, deal updates) for freshness.
2. **Normalization** — map raw provider objects into canonical entities; normalize phone to E.164, lowercase/trim emails, parse UTMs/`fbclid`, parse creative naming conventions.
3. **Identity resolution** — run the matching engine (Section 8) to link Leads↔Ads and Leads↔Deals; write MatchAudit.
4. **Aggregation** — materialize metrics per ad/ad set/campaign per day, with **cohorting by lead-created date** (see Section 9) as well as by spend date.
5. **Feedback** — emit ConversionEvents to Meta CAPI per config.
6. **Reconciliation** — idempotent upserts; re-process the trailing window; expose data-freshness + match-rate so users can trust the numbers.

Design for **idempotency end to end** (re-running a sync must not double count) and **incremental** processing (don't re-pull everything every time).

---

## 8. Identity Resolution & Matching Engine (the core — invest here)

This is the heart of the product. Treat it as a first-class subsystem with its own tests and metrics.

- **Deterministic first:** try `leadgen_id` → `fbclid` → normalized phone → email, in order. First confident hit wins; record key + confidence in MatchAudit.
- **Probabilistic fallback:** UTM (campaign/adset granularity) and name+time proximity produce **low-confidence** matches that go to a **manual review queue**, never silently into reported revenue.
- **Deduplication:** the same human can appear as a Meta lead and a CRM lead and a CRM contact — collapse to one Contact. Same deal must not be counted twice.
- **Confidence & transparency:** every attributed dollar must be explainable ("matched by phone, 99%"). Expose an account-level **match rate** ("% of CRM revenue attributable to an ad") — attribution tools live or die on trust.
- **Conflict handling:** if a lead could match two ads (e.g., clicked two), apply the configured attribution model (Section 9) rather than guessing.

**Acceptance bar:** for Meta Lead Ads, ad-level attribution should be ~100% deterministic; for website/funnel leads, the product should surface exactly how many leads/deals are matched vs unmatched and why.

---

## 9. Attribution Engine

- **Models:** support First-touch, Last-touch, and at least one multi-touch (linear or time-decay); **position-based** optional. Default configurable per tenant. Show first-click and last-click side by side (the reference product exposed both).
- **Windows:** configurable lookback (e.g., 7-day click / 1-day view; allow longer for long sales cycles).
- **Time-lag / cohort accuracy (important & subtle):** a sale today often came from spend made days/weeks ago. Money must be attributed to the **spend that generated the lead** (by first-touch / lead-created date), not to the day the sale closed. Provide **cohort (vintage) reporting**: "of the leads generated by this ad in week N, X% have purchased so far, ROAS = …". This prevents the classic error of dividing today's revenue by today's spend.
- **Reconcile with Meta's own numbers:** your attributed conversions will differ from Meta's reported conversions (different methodology). Show both and label them; don't pretend they're the same.

---

## 10. Metrics & Definitions (single source of truth)

Compute per Ad, Ad Set, Campaign, and totals, for any date range:

| Metric | Definition |
|---|---|
| Spend | Meta ad spend (account currency + converted) |
| Impressions / Clicks / CTR / CPM / CPC / Frequency / Reach | From Meta insights |
| Leads | Count of leads attributed to the ad |
| Cost per Lead (CPL) | Spend / Leads |
| Qualified Leads (QL) | Leads whose CRM status maps to "Qualified" |
| QL Rate | QL / Leads |
| Cost per Qualified Lead | Spend / QL |
| Sales / Purchases | Count of Deals with status "Won" attributed to the ad |
| Cost per Sale (CAC) | Spend / Sales |
| Revenue | Sum of Won deal amounts (converted to report currency) |
| ROAS | Revenue / Spend |
| ARPL | Revenue / Leads |
| Conversion Rate | Sales / Leads (and optionally Sales / QL) |
| Deal/Cycle Time | Avg time from lead-created to won |

All money is stored in **native currency + a normalized report currency** using **dated FX rates** (ad spend is often USD, revenue often local, e.g., UZS). Never mix currencies in a sum.

---

## 11. Reporting / UI

- **Performance table** (the centerpiece): rows = Campaigns / Ad sets / Ads (drill-down), columns = the metrics above, with sortable columns, column chooser, date-range and attribution-model selectors, and a "quality vs volume" emphasis (CPL **and** cost-per-qualified-lead **and** ROAS visible together).
- **Lead/Deal drill-down with Journey timeline:** for any lead, show the full path (first click → lead created → qualified → won), with source, ad, amounts, and the match method/confidence.
- **Creative insights:** aggregate by parsed creative dimensions (hook/concept/angle/format) so the team learns which *creative ideas* convert, not just which ad ids.
- **Data trust panel:** match rate, unmatched leads, last sync time, and a manual-match review queue.
- **Alerts/automation (phase 2+):** notify when cost-per-qualified-lead crosses a threshold, or when a scaling ad's quality drops.

---

## 12. Architecture (recommended)

- **API/application layer** — a typed backend (TypeScript/Node **or** Python). Clean separation: connectors / domain / matching / attribution / aggregation / API.
- **Transactional store** — PostgreSQL for canonical entities, config, audit.
- **Analytics store** — for fast aggregation at scale, a columnar engine (ClickHouse, or a warehouse like BigQuery). Start with Postgres + materialized views; introduce columnar when data volume demands it. Design the aggregation layer so this swap is contained.
- **Async jobs / orchestration** — a durable workflow/queue (Temporal, or a robust queue like BullMQ/Celery) for syncs, retries, backoff, and webhook processing. Syncs must be retryable and idempotent.
- **Secrets vault** — for OAuth/system tokens (not plaintext in the DB).
- **Frontend** — React/Next.js, server-driven tables, charts.
- **Connector SDK** — the shared interface in §6 so Meta/Bitrix/amoCRM are interchangeable and new providers are additive.

> These are recommendations with rationale; Claude Code may propose alternatives but must preserve: pluggable connectors, canonical model, idempotent incremental sync, and an aggregation layer that can scale.

---

## 13. Non-Functional Requirements ("world-class", not MVP)

- **Multi-tenancy & isolation** — strict tenant scoping on every query; no cross-tenant leakage; per-tenant config (stage mapping, attribution, currency).
- **Security & privacy** — leads contain PII (phone/email). Encrypt at rest, hash PII where possible (and always before sending to Meta), least-privilege OAuth scopes, full audit logs, data-retention controls, per-tenant data deletion. Token vault.
- **Reliability & resilience** — API rate-limit handling (Meta especially), exponential backoff, partial-failure recovery, idempotent upserts, dead-letter queues for failed webhooks.
- **Accuracy & trust** — exposed match rate and reconciliation; numbers must be explainable and reproducible.
- **Scalability** — millions of insight rows and leads; incremental + columnar aggregation; pagination everywhere.
- **Observability** — structured logging, metrics, tracing; sync dashboards (freshness, failures, match rate) for ops.
- **Extensibility** — new ad source / new CRM = new connector, no core rewrite.
- **Testing** — heavy unit/integration coverage on the matching and attribution engines with realistic fixtures (lead ads, website leads, dupes, currency, time-lag, retroactive changes).
- **Internationalization** — multi-currency, multi-timezone, and UI/stage labels in the tenant's language (e.g., Uzbek/Russian/English).

---

## 14. Suggested Build Sequence (stage the work without cutting the vision)

1. **Foundations** — tenant/user/RBAC, canonical schema, secrets vault, job orchestration skeleton.
2. **Meta read** — OAuth, ad hierarchy + daily insights, trailing-window idempotent sync.
3. **Bitrix24 read** — leads/deals/contacts/stages + webhooks; per-tenant stage→canonical mapping UI.
4. **Matching engine v1** — deterministic keys (leadgen_id, fbclid, phone, email) + MatchAudit + match-rate metric.
5. **Metrics + performance table** — the centerpiece UI with drill-down and the metric set in §10, multi-currency.
6. **Attribution models + cohort reporting** — first/last/multi-touch, lookback windows, vintage ROAS.
7. **Feedback loop** — Meta Conversions API / Conversion Leads (opt-in, audited).
8. **Lead journey UI + creative insights + data-trust panel + review queue.**
9. **amoCRM/Kommo connector** (proves the connector abstraction).
10. **Alerts/automation, hardening, observability, scale (columnar store).**

Each stage should be independently shippable and testable, but built on the full domain model from step 1 (so nothing is throwaway).

---

## 15. Acceptance Criteria (definition of done for the core)

- Given a Meta campaign with ad sets and ads and a connected CRM, AdLink shows, per ad/ad set/campaign and date range: spend, leads, qualified leads, sales, revenue, CPL, cost-per-qualified-lead, CAC, ROAS, ARPL, conversion rate, deal time — with money correctly converted across currencies.
- For Meta Lead Ads, leads are attributed to the exact ad deterministically; for website leads, matched vs unmatched counts and reasons are visible.
- A lead's full journey (first click → lead → qualified → won) is viewable with match method + confidence.
- Tenants can map their own CRM stages to canonical statuses and pick the revenue field without code changes.
- Qualified-lead and purchase events can be sent back to Meta (opt-in) and are audited.
- Re-running syncs never double-counts; retroactive Meta/CRM changes are reflected.
- Strict tenant isolation; PII encrypted; tokens vaulted.

---

## 16. Open Questions / Decisions Needed (please decide before/while building)

1. **Primary backend language** — TypeScript/Node or Python? (Both fine; pick one for consistency.)
2. **Click capture for website leads** — will you provide a tracking snippet/landing layer to capture `fbclid`/UTMs, or rely solely on CRM-stored fields? (Strongly recommend providing capture — it makes ad-level attribution deterministic instead of guesswork.)
3. **Default attribution model & windows** — first-click, last-click, or multi-touch by default? What lookback fits your sales cycle?
4. **Qualified-lead definition** — purely CRM-stage based, or also rule-based (e.g., "qualified = reached Zoom stage AND has phone")?
5. **Feedback loop scope at launch** — send back only Purchases, or also QualifiedLead? Per ad account opt-in?
6. **Report currency** — single tenant currency (e.g., USD or UZS) with dated FX, confirmed?
7. **Which CRMs after Bitrix24** — amoCRM/Kommo next, then HubSpot/Salesforce?
8. **Which ad platforms after Meta** — Google Ads / TikTok on the roadmap (affects how generic the connector layer must be from day 1)?

---

## 17. Resolved Decisions (locked 2026-06-21)

### Stack
- **Frontend:** Next.js + **shadcn/ui** (100%)
- **Backend:** Nest.js (TypeScript) — modules: `connectors / matching / attribution / aggregation / api`
- **DB:** PostgreSQL (canonical model + audit); ClickHouse later if volume demands, aggregation layer kept swappable
- **Monorepo:** pnpm workspaces — `apps/web` (Next), `apps/api` (Nest), `packages/core` (canonical model + connector interface, shared types), `packages/db` (schema)
- **Jobs:** BullMQ (Redis) for syncs, retries, backoff, webhook processing

### §16 answers
1. **Backend language** → TypeScript / Nest.js.
2. **Click capture** → **Yes, ship a tracking snippet + landing capture endpoint** that stores `fbclid`/UTMs on the CRM lead → deterministic website attribution (not guesswork).
3. **Attribution** → show **first-touch and last-touch side by side**; multi-touch (linear/time-decay) added later. Default lookback **30-day click / 1-day view**, per-tenant configurable.
4. **Qualified-lead** → **CRM-stage based only** (per-tenant stage mapping). No rule engine for now.
5. **Feedback loop** → send **QualifiedLead + Purchase** back to Meta, **opt-in per ad account**, fully audited.
6. **Report currency** → **per-tenant, default USD**; native currency stored + dated FX conversion, currencies never mixed in a sum.
7. **Next CRM** → **amoCRM/Kommo** after Bitrix24, then HubSpot/Salesforce.
8. **Ad platforms** → **Meta only for now**; connector layer stays generic so Google/TikTok are additive later.

### Deferred (built generic, not implemented yet)
Multi-touch attribution models · ClickHouse columnar store · Google/TikTok connectors · HubSpot/Salesforce connectors · rule-based qualification.
