#!/usr/bin/env bash
# Zero-ish downtime deploy for the isolated Orvient stack on the shared OVH VPS.
# Does not touch Distrofy or Vela containers / networks.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -p orvient -f "$ROOT/infra/docker-compose.yml")
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
HEALTH_URL="http://127.0.0.1:3200/api/v1/health"
MAX_RETRIES=36
RETRY_DELAY=5

cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy infra/.env.production.example and fill secrets." >&2
  exit 1
fi

# Compose variable substitution (POSTGRES_PASSWORD, REDIS_PASSWORD, etc.).
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "POSTGRES_PASSWORD is required in $ENV_FILE" >&2
  exit 1
fi
if [[ -z "${REDIS_PASSWORD:-}" ]]; then
  echo "REDIS_PASSWORD is required in $ENV_FILE" >&2
  exit 1
fi
if [[ -z "${JWT_ACCESS_SECRET:-}" ]]; then
  echo "JWT_ACCESS_SECRET is required in $ENV_FILE" >&2
  exit 1
fi
if [[ -z "${PUBLIC_HOST:-}" ]]; then
  echo "PUBLIC_HOST is required in $ENV_FILE (e.g. app.example.com)" >&2
  exit 1
fi
if [[ -z "${NEXT_PUBLIC_API_URL:-}" ]]; then
  echo "NEXT_PUBLIC_API_URL is required in $ENV_FILE" >&2
  exit 1
fi
if [[ -z "${CORS_ORIGIN:-}" ]]; then
  echo "CORS_ORIGIN is required in $ENV_FILE" >&2
  exit 1
fi

write_cloudflared_config() {
  local creds="$ROOT/infra/cloudflared/credentials.json"
  local tpl="$ROOT/infra/cloudflared/config.yml.template"
  local cfg="$ROOT/infra/cloudflared/config.yml"
  if [[ ! -f "$creds" ]]; then
    echo "Missing $creds — on your PC after tunnel create, copy:" >&2
    echo "  ~/.cloudflared/<tunnel-uuid>.json  →  infra/cloudflared/credentials.json" >&2
    exit 1
  fi
  local tid="${CLOUDFLARE_TUNNEL_ID:-}"
  if [[ -z "$tid" ]]; then
    tid="$(grep -o '"TunnelID"[[:space:]]*:[[:space:]]*"[^"]*"' "$creds" | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')"
  fi
  if [[ -z "$tid" ]]; then
    echo "Set CLOUDFLARE_TUNNEL_ID in $ENV_FILE (or fix TunnelID in credentials.json)" >&2
    exit 1
  fi
  sed -e "s/__TUNNEL_ID__/$tid/g" -e "s/__PUBLIC_HOST__/$PUBLIC_HOST/g" "$tpl" >"$cfg"
  # cloudflared container user must read credentials (600 → permission denied)
  chmod 644 "$creds" "$cfg" 2>/dev/null || true
  echo "==> cloudflared config for tunnel $tid → $PUBLIC_HOST"
}

write_cloudflared_config

echo "==> Pulling / building Orvient images (project: orvient)"
"${COMPOSE[@]}" --env-file "$ENV_FILE" build api web

echo "==> Starting data plane"
"${COMPOSE[@]}" --env-file "$ENV_FILE" up -d postgres redis

echo "==> Waiting for Postgres"
for ((i = 1; i <= 30; i++)); do
  if "${COMPOSE[@]}" --env-file "$ENV_FILE" exec -T postgres \
    pg_isready -U "${POSTGRES_USER:-inventory}" -d "${POSTGRES_DB:-inventory}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then
    echo "Postgres did not become ready" >&2
    exit 1
  fi
done

echo "==> Running Prisma migrations"
"${COMPOSE[@]}" --env-file "$ENV_FILE" run --rm --no-deps \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-inventory}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-inventory}?schema=public" \
  --entrypoint "" api \
  pnpm --filter @inventory/database migrate:deploy

# Keep tunnel up while app swaps — avoids Cloudflare 522 blips.
echo "==> Recreating api + web (tunnel stays up)"
"${COMPOSE[@]}" --env-file "$ENV_FILE" up -d --force-recreate --no-deps api web

echo "==> Health check ($HEALTH_URL)"
ok=0
for ((i = 1; i <= MAX_RETRIES; i++)); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    ok=1
    break
  fi
  echo "  waiting… ($i/$MAX_RETRIES)"
  sleep "$RETRY_DELAY"
done

if [[ "$ok" -ne 1 ]]; then
  echo "Health check failed — recent api logs:" >&2
  "${COMPOSE[@]}" --env-file "$ENV_FILE" logs --tail 40 api >&2 || true
  exit 1
fi

# Keep the tunnel up. Only force-recreate when the pinned image tag changed
# (or the container is missing). App recreate must not take the tunnel down.
desired="$("${COMPOSE[@]}" --env-file "$ENV_FILE" config --images 2>/dev/null | grep -E 'cloudflared' | head -n1 | tr -d '\r' || true)"

if [[ -n "$desired" ]]; then
  echo "==> Validating tunnel ingress"
  docker run --rm -v "$ROOT/infra/cloudflared:/etc/cloudflared:ro" "$desired" \
    tunnel --config /etc/cloudflared/config.yml ingress validate
fi

tunnel_cid="$(docker ps -aq -f name=orvient-cloudflared 2>/dev/null | head -n1 || true)"
running_img=""
if [[ -n "$tunnel_cid" ]]; then
  running_img="$(docker inspect -f '{{.Config.Image}}' "$tunnel_cid" 2>/dev/null || true)"
fi

need_tunnel=0
if [[ -z "$tunnel_cid" ]]; then
  need_tunnel=1
elif [[ -n "$desired" && -n "$running_img" && "$desired" != "$running_img" ]]; then
  need_tunnel=1
fi

if [[ "$need_tunnel" -eq 1 ]]; then
  echo "==> Recreating cloudflared (missing or image tag change: ${running_img:-none} → ${desired:-unknown})"
  "${COMPOSE[@]}" --env-file "$ENV_FILE" pull cloudflared >/dev/null 2>&1 || true
  "${COMPOSE[@]}" --env-file "$ENV_FILE" up -d --force-recreate --no-deps cloudflared
else
  echo "==> Ensuring cloudflared is up (no image change)"
  "${COMPOSE[@]}" --env-file "$ENV_FILE" up -d --no-deps cloudflared
fi

api_status="$("${COMPOSE[@]}" --env-file "$ENV_FILE" ps --format '{{.Status}}' api 2>/dev/null | head -n1 || true)"
if [[ "$api_status" == Restarting* ]] || [[ "$api_status" == *Exit* ]]; then
  echo "API unhealthy: $api_status — recent logs:" >&2
  "${COMPOSE[@]}" --env-file "$ENV_FILE" logs --tail 40 api >&2 || true
  exit 1
fi

echo "==> Deploy OK"
"${COMPOSE[@]}" --env-file "$ENV_FILE" ps
