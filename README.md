# AdLink

Performance-marketing SaaS that joins **Meta Ads spend** to **CRM outcomes** (Bitrix24 first),
attributes revenue down to the individual ad, and feeds qualified-lead/purchase events back to
Meta so campaigns optimize for **quality, not cheap leads**.

- Vision & spec: [`adprofit.md`](./adprofit.md)
- Build plan (phases 0–11): [`PLAN.md`](./PLAN.md)
- Design system: [`DESIGN.md`](./DESIGN.md)

## Stack
Next.js + shadcn/ui · Nest.js · PostgreSQL + Prisma · pnpm workspaces · BullMQ (Redis).

## Monorepo
```
apps/web      Next.js (App Router) + shadcn
apps/api      Nest.js
packages/core canonical types, enums, connector interfaces, metrics/matching/recommendations
packages/db   Prisma schema + client
```

## Status — built & verified (51 tests green)
- **Auth & tenancy** — JWT + RBAC; strict per-tenant isolation (AsyncLocalStorage + Prisma extension).
- **Connectors** — Meta (hierarchy + daily insights), Bitrix24 & amoCRM (stages/leads/deals/contacts) behind one interface + a provider registry. Idempotent trailing-window sync via BullMQ.
- **Stage mapping** — per-tenant CRM stage → canonical status (Lead/Qualified/Won/Lost).
- **Matching engine** — leadgen_id / fbclid / phone / email / utm → ad, with confidence, review queue, match rate, manual resolve, click-capture beacon.
- **Metrics** — true unit economics per ad/adset/campaign (CPL, cost-per-QL, CAC, ROAS, ARPL…), multi-currency via dated FX, first/last-touch attribution, vintage-cohort ROAS.
- **Feedback loop** — QualifiedLead + Purchase → Meta CAPI (opt-in per account, hashed PII, idempotent, audited).
- **Web** — performance table (tree drill-down + ROAS heatmap), creative insights, data-trust + review queue, lead journey, recommendations ("scale/pause"), settings/onboarding. Light/dark, uz/ru/en i18n.
- **Hardening** — rate limiting, retry/backoff + DLQ retention, structured logging (pino) + Sentry + health checks.

Deferred (need a real deploy target): full OpenTelemetry tracing, Redis dashboard cache, alerting, per-account CAPI dataset, billing.

## Quick start
```bash
pnpm install
cp .env.example .env          # fill values
docker compose up -d          # postgres + redis
pnpm db:generate
pnpm db:migrate               # apply migrations
pnpm db:seed                  # demo tenant (Phase 1+)

pnpm dev:api                  # http://localhost:4000  (Swagger at /docs)
pnpm dev:web                  # http://localhost:3000
```

## Scripts
| Command | Action |
|---|---|
| `pnpm build` / `lint` / `typecheck` / `test` | run across all packages |
| `pnpm db:migrate` | Prisma migrate dev |
| `pnpm dev:api` / `pnpm dev:web` | run a single app in watch mode |
