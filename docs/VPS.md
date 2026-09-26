# VPS deploy (shared OVH box)

Production target: the same OVH VPS that already runs **Distrofy** (Caddy :80/:443) and **Vela** (Cloudflare Tunnel).

**Isolation rule:** share **only** the host hardware and public IP. Orvient has its own Compose project, Docker network, Postgres, Redis, volumes, secrets, Cloudflare Tunnel, and backups. Never attach to `distrofy-net` or `vela-net`, and never bind host ports 80/443.

Canonical local/dev: root [`docker-compose.yml`](../docker-compose.yml). Dedicated-box Caddy prod (no tunnel): [`docker-compose.prod.yml`](../docker-compose.prod.yml). This doc is **shared-VPS only**.

---

## Architecture

```
Internet → Cloudflare (PUBLIC_HOST)
        → cloudflared tunnel (orvient-cloudflared)
        → /api/*  → orvient-api:4000
        → else    → orvient-web:3000
             ├─ orvient-postgres (private orvient-net)
             └─ orvient-redis   (private orvient-net)
```

| Resource | Orvient | Distrofy | Vela |
|----------|---------|----------|------|
| Directory | `/var/www/orvient` | `/var/www/distrofy-webapp` | `/var/www/vela-webapp` |
| Compose project | `orvient` | `distrofy-webapp` | `vela-webapp` |
| Network | `orvient-net` | `distrofy-net` | `vela-net` |
| Ingress | Cloudflare Tunnel | Caddy :80/:443 | Cloudflare Tunnel |
| Health (localhost) | `127.0.0.1:3200` | (in-container) | `127.0.0.1:3100` |

---

## One-time server setup

1. **Clone** (separate folder from Distrofy / Vela):

```bash
sudo mkdir -p /var/www/orvient
sudo chown "$USER:$USER" /var/www/orvient
git clone <this-repo-url> /var/www/orvient
cd /var/www/orvient
```

2. **Secrets:**

```bash
cp infra/.env.production.example .env.production
chmod 600 .env.production
# Edit: POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_ACCESS_SECRET,
# PUBLIC_HOST, CORS_ORIGIN, NEXT_PUBLIC_*, APP_URL, CLOUDFLARE_TUNNEL_ID
```

3. **Cloudflare Tunnel**

Create it with the **CLI, not the dashboard**. Dashboard tunnels ignore `infra/cloudflared/config.yml`.

```bash
cloudflared tunnel login
cloudflared tunnel create orvient   # prints the tunnel UUID
```

Copy credentials onto the VPS:

```bash
# From the machine that ran tunnel create:
scp ~/.cloudflared/<tunnel-uuid>.json ubuntu@<vps>:/var/www/orvient/infra/cloudflared/credentials.json
```

Set `CLOUDFLARE_TUNNEL_ID` in `.env.production` to that UUID (deploy also reads `TunnelID` from credentials.json).

DNS (proxied CNAME):

- `PUBLIC_HOST` → `<TUNNEL_UUID>.cfargotunnel.com`

SSL/TLS mode on the zone: **Full (strict)**.

4. **Swap** (OOM safety if not already present on the host):

```bash
# Skip if Distrofy/Vela already configured swap on this box.
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

5. **Tools on host:** Docker + Compose plugin, `curl`, `git`.

---

## Deploy

On the VPS:

```bash
cd /var/www/orvient
git pull origin main
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

From your laptop (OpenSSH):

```bash
# PowerShell
$env:VPS_SSH = "ubuntu@<server>"; pnpm deploy:vps

# Bash
VPS_SSH=ubuntu@<server> pnpm deploy:vps
```

Optional: `VPS_APP_DIR` (default `/var/www/orvient`), `VPS_GIT_REF` (default `main`).

What the script does:

- Builds `api` + `web`, brings up Postgres/Redis, runs Prisma migrate
- Force-recreates **api + web only** (tunnel stays up → fewer 522 blips)
- Health-checks `http://127.0.0.1:3200/api/v1/health`
- Recreates `cloudflared` only when its image changed or it was not running
- Fails if `api` is `Restarting` / exited

First production seed (once), then rotate the seed admin password:

```bash
docker compose -p orvient -f infra/docker-compose.yml --env-file .env.production \
  exec api pnpm --filter @inventory/database seed
```

---

## Resource limits (Compose)

| Container | mem_limit | Notes |
|-----------|-----------|-------|
| `orvient-api` | 512m | Nest API |
| `orvient-web` | 512m | Next.js standalone |
| `orvient-postgres` | 512m | Dedicated DB |
| `orvient-redis` | 128m | Cache / lockout (LRU) |
| `orvient-cloudflared` | 128m | Outbound tunnel |

Avoid Orvient deploys during Distrofy blue/green builds or heavy Vela ffmpeg batches.

**Upgrade trigger:** combined host RAM steady > ~70%, swap thrashing, or latency regressions → resize the VPS or move an app off-box.

---

## Ops cheat sheet

```bash
# Status
docker compose -p orvient -f infra/docker-compose.yml --env-file .env.production ps

# Logs
docker compose -p orvient -f infra/docker-compose.yml --env-file .env.production logs -f --tail 100 api
docker compose -p orvient -f infra/docker-compose.yml --env-file .env.production logs -f --tail 100 web

# DB shell (no public port)
docker compose -p orvient -f infra/docker-compose.yml --env-file .env.production exec postgres \
  psql -U inventory -d inventory

# Stop Orvient only (Distrofy / Vela untouched)
docker compose -p orvient -f infra/docker-compose.yml --env-file .env.production down
# Keep volumes: omit -v. Destroy data: add -v (dangerous).
```

---

## Security checklist

- [ ] `.env.production` mode `600`, not in git
- [ ] Distinct passwords from Distrofy / Vela
- [ ] No Postgres/Redis ports on `0.0.0.0`
- [ ] Cloudflare SSL full (strict) for `PUBLIC_HOST`
- [ ] `JWT_ACCESS_SECRET` ≥32 chars, not a `change-me` placeholder
- [ ] `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=strict`
- [ ] Seed once, then change seed admin password
- [ ] Swagger off unless `ENABLE_SWAGGER=true`

---

## Related

- Env template: [`infra/.env.production.example`](../infra/.env.production.example)
- Compose: [`infra/docker-compose.yml`](../infra/docker-compose.yml)
- Solo-box Caddy: [`docker-compose.prod.yml`](../docker-compose.prod.yml)
