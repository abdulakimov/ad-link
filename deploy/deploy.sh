#!/usr/bin/env bash
# Server-side deploy for adlink → adlink.narwon.uz on the shared VPS.
# Idempotent: safe to re-run for redeploys. Touches ONLY adlink resources.
set -euo pipefail

ROOT=/root/apps/adlink
cd "$ROOT"

log() { echo -e "\n\033[1;36m== $* ==\033[0m"; }

# ---------------------------------------------------------------------------
# 1. Secrets — never committed. APP_SECRET/ENCRYPTION_KEY are generated on
# first run; GOOGLE_*/TELEGRAM_*/META_* must already be present in this file
# (provisioned once by hand — see deploy README) before the first deploy.
# ---------------------------------------------------------------------------
SECRETS="$ROOT/.deploy-secrets.env"
if [ ! -f "$SECRETS" ]; then
  log "Generating app secrets (first run)"
  {
    echo "APP_SECRET=$(openssl rand -hex 24)"
    echo "ENCRYPTION_KEY=$(openssl rand -hex 16)"   # 32 hex chars == 32 bytes-as-chars
  } > "$SECRETS"
  chmod 600 "$SECRETS"
fi
# shellcheck disable=SC1090
source "$SECRETS"

for var in APP_SECRET ENCRYPTION_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TELEGRAM_BOT_TOKEN META_APP_ID META_APP_SECRET; do
  if [ -z "${!var:-}" ]; then
    echo "Missing $var in $SECRETS — add it before deploying." >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# 2. Production env files
# ---------------------------------------------------------------------------
log "Writing production .env files"
cat > "$ROOT/.env" <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://adlink:adlink@localhost:5470/adlink?schema=public
REDIS_URL=redis://localhost:6390
APP_SECRET=$APP_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
WEB_ORIGIN=https://adlink.narwon.uz
API_PORT=4070
API_GLOBAL_PREFIX=api
NEXT_PUBLIC_API_URL=https://adlink.narwon.uz/api

GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=https://adlink.narwon.uz/api/auth/google/callback

TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
NEXT_PUBLIC_TELEGRAM_BOT=adlink_platformbot
NEXT_PUBLIC_TELEGRAM_BOT_ID=8775039918

META_APP_ID=$META_APP_ID
META_APP_SECRET=$META_APP_SECRET
META_API_VERSION=v21.0
META_REDIRECT_URI=https://adlink.narwon.uz/api/integrations/meta/oauth/callback

FX_PROVIDER_API_KEY=
SENTRY_DSN=
EOF

# Prisma CLI reads its own .env from the db package
cat > "$ROOT/packages/db/.env" <<EOF
DATABASE_URL=postgresql://adlink:adlink@localhost:5470/adlink?schema=public
EOF

# ---------------------------------------------------------------------------
# 3. Infra — isolated postgres + redis (project name `adlink`, loopback ports)
# ---------------------------------------------------------------------------
log "Starting postgres + redis (docker compose -p adlink)"
docker compose -p adlink -f docker-compose.yml -f docker-compose.prod.yml up -d

log "Waiting for postgres to accept connections"
for i in $(seq 1 30); do
  if docker exec adlink-postgres pg_isready -U adlink >/dev/null 2>&1; then
    echo "postgres ready"; break
  fi
  sleep 2
  [ "$i" = "30" ] && { echo "postgres did not become ready"; exit 1; }
done

# ---------------------------------------------------------------------------
# 4. Install, migrate, build
# ---------------------------------------------------------------------------
# dev-only override that would otherwise win over .env.production at build time
rm -f "$ROOT/apps/web/.env.local"

log "pnpm install"
pnpm install --prefer-offline

log "Prisma generate + migrate deploy"
pnpm db:generate
pnpm --filter @adlink/db migrate:deploy

log "Build all packages"
pnpm build

# ---------------------------------------------------------------------------
# 5. Run under PM2
# ---------------------------------------------------------------------------
log "Starting PM2 processes"
pm2 startOrReload "$ROOT/ecosystem.config.cjs"
pm2 save

log "Done. PM2 status:"
pm2 list | grep -E "adlink-|name" || true
