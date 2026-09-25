# Orvient

A product of [Distrofy Enterprises](https://distrofyent.com).

API-first inventory, invoicing, and POS for wholesale / retail ops.

**Stack:** pnpm 9 + Turborepo · NestJS 10 API · Next.js 15 web · Prisma 6 · PostgreSQL · Redis (optional cache) · Resend (optional email) · Sentry (optional)

---

## Project structure

```
orvient/
├── apps/
│   ├── api/                 # @inventory/api — NestJS modular monolith
│   └── web/                 # @inventory/web — Next.js 15 App Router UI
├── packages/
│   ├── shared/              # @inventory/shared — Zod schemas + shared types
│   ├── database/            # @inventory/database — Prisma schema, migrations, seed
│   └── config/              # @inventory/config — shared tsconfig.base.json
├── docker/
│   ├── api.Dockerfile
│   ├── web.Dockerfile
│   └── Caddyfile            # TLS reverse proxy (prod)
├── scripts/                 # setup, check, backup, Windows helpers
├── .github/workflows/ci.yml
├── docker-compose.yml       # local: postgres, redis, api, web
├── docker-compose.prod.yml  # prod: + Caddy; DB/Redis not published
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

### Apps

| Package | Path | Role |
|---------|------|------|
| `@inventory/api` | `apps/api` | REST API under `/api/v1` |
| `@inventory/web` | `apps/web` | Browser UI (port 3000) |

### Packages

| Package | Path | Role |
|---------|------|------|
| `@inventory/shared` | `packages/shared` | Zod schemas, session/JWT types, role helpers |
| `@inventory/database` | `packages/database` | Prisma client, migrations, seed |
| `@inventory/config` | `packages/config` | Shared TypeScript base config |

---

## Features (what exists today)

| Area | Capabilities |
|------|----------------|
| **Auth** | Signup / login (multi-org) / switch-org · switch-branch / refresh / logout / me · forgot+reset password · accept invite · JWT + httpOnly cookies · login lockout |
| **Products** | CRUD · barcode lookup · barcode backfill · status filters |
| **Contacts** | Customers & suppliers · CRUD |
| **Inventory** | Stock in / out / adjust / transfer · ledger · history · low-stock email (Resend) |
| **Purchase orders** | Create · list · detail · receive (partial/full) · cancel |
| **Invoices** | Create · list · detail · PDF · payments · void · finalize quote · partial/full returns · public receipt link |
| **POS** | Quick sale · hold / resume carts (client) |
| **Reports** | Dashboard · sales · inventory · low stock · product history · customer purchases · invoice CSV export |
| **Org / users** | Org get/patch · branches · user list/create/patch · email invite · plan seat caps |
| **Billing** | Plans · Dodo checkout · manual requests · subscription gate · `maxUsers` / `maxBranches` |
| **Platform** | Admin overview · orgs/users/audit · billing request review · CSV exports |
| **Health** | `GET /health` (Postgres + Redis) · `GET /health/ready` |

**Not in this repo:** service worker / full offline PWA.

Authorization uses `MembershipRole` (`OWNER` | `ADMIN` | `MANAGER` | `CASHIER`). The `Role.permissions` DB field is unused metadata.

---

## Repository map (detail)

### API — `apps/api/src`

```
apps/api/src/
├── main.ts                 # bootstrap, CORS, helmet, optional Sentry, Swagger (non-prod)
├── app.module.ts           # global guards (JWT, roles, platform, subscription), Pino, throttling
├── config/                 # production env validation + selfcheck
├── common/                 # guards, decorators, pipes, audit
├── infrastructure/
│   ├── prisma/             # client + connection_limit helper
│   ├── redis/              # optional cache / lockout / JWT cache
│   └── email/              # Resend (dry-run if no API key)
└── modules/
    ├── auth/
    ├── billing/
    ├── products/
    ├── contacts/
    ├── inventory/
    ├── purchase-orders/
    ├── invoices/           # invoices + public receipts
    ├── pos/
    ├── reports/
    ├── organizations/      # org + users
    ├── platform/
    └── health/
```

**REST prefix:** `/api/v1`

| Module | Routes |
|--------|--------|
| Auth | `POST /auth/signup`, `/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/switch-org`, `/switch-branch` · `GET /auth/me`, `/auth/memberships` |
| Products | `GET/POST /products` · `GET /products/by-barcode/:code` · `GET/PATCH/DELETE /products/:id` · `POST /products/backfill-barcodes` |
| Contacts | `GET/POST /contacts` · `GET/PATCH/DELETE /contacts/:id` |
| Inventory | `POST /inventory/stock-in\|stock-out\|adjust\|transfer` · `GET /inventory/ledger` · `GET /inventory/history/:productId` |
| Purchase orders | `GET/POST /purchase-orders` · `GET /purchase-orders/:id` · `POST .../receive` · `POST .../cancel` |
| Invoices | `GET/POST /invoices` · `GET /invoices/:id` · `GET /invoices/:id/pdf` · `POST .../payments` · `.../void` · `.../finalize` · `.../return` |
| Receipts | `GET /receipts/:token` · `GET /receipts/:token/pdf` (public) |
| POS | `POST /pos/quick-sale` |
| Reports | `GET /reports/dashboard\|sales\|inventory\|low-stock\|export/sales` · product history · customer purchases |
| Org | `GET/PATCH /organizations/current` · `GET/POST /organizations/branches` · `PATCH /organizations/branches/:id` |
| Users | `GET/POST /users` · `POST /users/invite` · `PATCH /users/:id` |
| Billing | `GET /billing/plans` · `GET /billing/subscription` · `POST /billing/checkout` · `.../checkout/sync` · `.../manual-request` · `POST /billing/webhooks/dodo` |
| Platform | `GET /platform/overview` · orgs/users/audit · exports · `GET/PATCH /platform/billing/requests` |
| Health | `GET /health` · `GET /health/ready` |

Swagger (dev / non-prod only): http://localhost:4000/api/docs  
Force in production with `ENABLE_SWAGGER=true`.

### Web — `apps/web`

```
apps/web/
├── middleware.ts            # session cookie gate (inv_session / accessToken)
├── public/                  # icons, manifest.webmanifest
└── src/
    ├── app/
    │   ├── login/
    │   ├── register/
    │   ├── forgot-password/
    │   ├── reset-password/
    │   ├── accept-invite/
    │   ├── pricing/
    │   ├── receipt/[token]/ # public digital receipt
    │   ├── platform/        # platform admin shell
    │   ├── page.tsx         # root redirect
    │   └── (app)/           # authenticated tenant shell
    │       ├── dashboard/
    │       ├── onboarding/
    │       ├── pos/
    │       ├── products/
    │       ├── contacts/
    │       ├── inventory/
    │       ├── purchase-orders/   # list + new + [id]
    │       ├── invoices/          # list + [id]
    │       ├── reports/
    │       └── settings/          # org/users + billing/
    ├── components/
    ├── lib/                 # api client, auth-token, nav, csv, utils
    ├── stores/              # Zustand (auth session, POS draft + held carts)
    └── hooks/
```

| Route | Page |
|-------|------|
| `/login` | Sign in |
| `/register` | Create workspace |
| `/forgot-password`, `/reset-password` | Password reset |
| `/accept-invite` | Accept team invite |
| `/pricing` | Public pricing |
| `/receipt/[token]` | Public receipt |
| `/dashboard` | Metrics overview |
| `/onboarding` | First-run setup |
| `/pos` | Point of sale |
| `/products` | Product catalog |
| `/contacts` | Customers / suppliers |
| `/inventory` | Stock movements (staff+) |
| `/purchase-orders` | Purchase orders |
| `/invoices`, `/invoices/[id]` | Invoices |
| `/reports` | Reports |
| `/settings`, `/settings/billing` | Org / users / billing (staff+) |
| `/platform/*` | Platform admin |

Access token lives in **memory** (not `localStorage`). Refresh uses an httpOnly cookie. Middleware checks `inv_session` (or `accessToken` cookie).

### Database — `packages/database`

Prisma models: `Organization`, `Branch`, `User`, `Role`, `Membership`, `RefreshToken`, `AuthToken`, `Product`, `BranchStock`, `Contact`, `DocumentSequence`, `Invoice`, `InvoiceItem`, `InventoryTransaction`, `PurchaseOrder`, `PurchaseOrderItem`, `AuditLog`, `Plan`, `OrganizationSubscription`, `BillingRequest`, `PaymentAttempt`, `BillingPayment`, `DodoWebhookDelivery`.

Migrations: `packages/database/prisma/migrations/`. Seed: `packages/database/prisma/seed.ts` (demo org + admin + plans).

### Shared — `packages/shared`

Zod schemas for auth (incl. reset/invite), products, contacts, inventory, invoices (incl. returns), POS, org/users, billing, pagination; plus `SessionUser` / `JwtAuthUser` and role helpers (`isStaffRole`, `isOwnerAdminRole`).

---

## Prerequisites

- **Node.js 22+**
- **pnpm 9** (`corepack enable` or `npx pnpm@9.15.0`)
- **Docker Desktop** for local Postgres/Redis (or hosted Postgres — see Windows notes)

---

## Quick start

### Any OS (Docker for infra)

```bash
pnpm setup
pnpm infra:up
pnpm db:setup
pnpm dev
```

Or one shot:

```bash
pnpm bootstrap
pnpm dev
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:4000/api/v1 |
| Swagger | http://localhost:4000/api/docs |

**Demo login** (seed only — change before real deploy):

- Email: `admin@inventory.local`
- Password: `Admin123!`

### Windows — PATH helpers

```powershell
cd "E:\inventory management"
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\win.ps1 path
.\scripts\win.ps1 bootstrap
.\scripts\win.ps1 dev
```

### Windows without Docker

```powershell
.\scripts\native-windows.ps1 hosted
.\scripts\win.ps1 dev
```

Or local Postgres: `.\scripts\native-windows.ps1 local`

---

## Commands

| Command | What it does |
|---------|----------------|
| `pnpm setup` | `.env` from example, install, build shared, generate Prisma |
| `pnpm setup:env` | Env files only |
| `pnpm infra:up` / `infra:down` | Start/stop Postgres + Redis containers |
| `pnpm db:setup` | Generate + migrate deploy + seed |
| `pnpm db:migrate` | Dev migrations |
| `pnpm db:deploy` | Production migrate deploy |
| `pnpm db:seed` | Seed demo data |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:reset` | Reset DB (destructive) |
| `pnpm db:backup` | `pg_dump` via `scripts/backup-postgres.mjs` |
| `pnpm dev` | Shared watch + API + Web |
| `pnpm dev:api` / `dev:web` | Single app |
| `pnpm build` | Production builds |
| `pnpm start:api` / `start:web` | Run built apps |
| `pnpm typecheck` | `tsc --noEmit` across packages |
| `pnpm test` | Package smoke checks |
| `pnpm test:db` | API DB selfchecks (tenant, billing, inventory, platform) |
| `pnpm audit` | `pnpm audit --audit-level=high` |
| `pnpm check` | Full validate + typecheck + builds |
| `pnpm docker:up` | Dev Compose stack (migrate, **no** auto-seed) |
| `pnpm docker:seed` | Seed in running API container |
| `pnpm docker:prod` | Prod stack (Caddy TLS, DB not published) |
| `pnpm docker:prod:seed` | Seed in prod API container |
| `pnpm docker:prod:down` / `docker:prod:logs` | Prod tear down / logs |
| `pnpm docker:down` / `docker:logs` | Dev tear down / logs |

If `pnpm` is not on PATH: `npx pnpm@9.15.0 <script>`

---

## Environment

Copy `.env.example` → `.env` (`pnpm setup:env` does this). Setup also syncs copies for `apps/api`, `packages/database`, and creates `apps/web/.env.local` with `NEXT_PUBLIC_API_URL`.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose Postgres |
| `REDIS_URL` / `REDIS_DISABLED` | Cache / lockout / JWT cache; `REDIS_DISABLED=true` skips Redis locally |
| `JWT_ACCESS_SECRET` | Access JWT (≥32 chars; production rejects placeholders) |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | Token lifetimes |
| `API_PORT` / `API_HOST` | API listen address |
| `CORS_ORIGIN` | Allowed origins (required in production) |
| `NEXT_PUBLIC_API_URL` | Browser-facing API base (bake before web Docker build) |
| `NEXT_PUBLIC_APP_URL` | Public app origin (receipts, emails) |
| `APP_URL` | Server-side app origin for email links (falls back to `NEXT_PUBLIC_APP_URL`) |
| `COOKIE_SECURE` | Must be `true` in production |
| `COOKIE_SAME_SITE` | `strict` (default prod / same-origin) or `lax` (local split ports) |
| `PRISMA_CONNECTION_LIMIT` | Pool size appended to `DATABASE_URL` (default `10`) |
| `DOMAIN` | Hostname for Caddy (`docker:prod`) |
| `ENABLE_SWAGGER` | Force Swagger in production |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Demo seed credentials |
| `PLATFORM_ADMIN_EMAIL` | Platform admin (defaults to seed admin email) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email (optional; logs if unset) |
| `SENTRY_DSN` | Error tracking (optional) |
| `DODO_PAYMENTS_*` / `DODO_TEST_PRODUCT_ID` | Billing checkout (optional; 503 if unset) |

---

## Docker deploy

**Local / demo** (ports open, no TLS):

```bash
pnpm setup:env
# set JWT_ACCESS_SECRET (≥32, not a placeholder); COOKIE_SAME_SITE=lax
pnpm docker:up
pnpm docker:seed   # first boot only
```

**Production** (`docker-compose.prod.yml`: no DB/Redis host ports, Caddy TLS, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=strict`):

```bash
# Required in .env:
#   DOMAIN=app.example.com
#   CORS_ORIGIN=https://app.example.com
#   NEXT_PUBLIC_API_URL=https://app.example.com/api/v1
#   NEXT_PUBLIC_APP_URL=https://app.example.com
#   APP_URL=https://app.example.com
#   JWT_ACCESS_SECRET=<openssl rand -base64 48>
#   POSTGRES_PASSWORD=<strong unique password>
#   COOKIE_SECURE=true
pnpm docker:prod
pnpm docker:prod:seed   # first boot only — then change seed admin password
```

Compose prod services: `postgres`, `redis`, `api` (migrate + start), `web`, `caddy` (80/443).

---

## Production checklist

1. Strong `JWT_ACCESS_SECRET` (≥32 chars, **not** a `change-me` placeholder)
2. Non-default `POSTGRES_PASSWORD` (default `inventory/inventory` refused in production)
3. `COOKIE_SECURE=true` and same-origin `COOKIE_SAME_SITE=strict` behind Caddy
4. Use `pnpm docker:prod` (or equivalent): TLS via Caddy, DB/Redis not published
5. Migrate on release; seed **once**, then rotate seed admin password
6. Back up Postgres regularly (`pnpm db:backup` or volume snapshots)
7. Redis is cache/lockout — ephemeral is fine; `/health` may report `degraded`
8. Swagger off unless `ENABLE_SWAGGER=true`
9. Past-due subscriptions blocked after grace (billing/auth/platform stay open)
10. Set `RESEND_API_KEY` for invites / password reset / low-stock mail

---

## Architecture notes

- **Monorepo:** `apps/*` + `packages/*` via pnpm workspaces; Turborepo for `dev` / `build` / `typecheck` / `test`
- **API style:** Nest feature modules; global JWT + roles + platform + subscription guards
- **Tenancy:** multi-tenant SaaS — `organizationId` on domain rows; self-serve signup creates an org; JWT scopes the session
- **Stock:** `InventoryTransaction` ledger + per-branch `BranchStock`
- **Billing:** plan seat caps enforced; feature bullets on plans are marketing copy
- **CI:** install → **audit (high)** → Prisma validate → migrate → seed → typecheck → test → test:db → build

---

## Scripts folder

| Script | Purpose |
|--------|---------|
| `scripts/setup.mjs` | Env + install + shared/db bootstrap |
| `scripts/check.mjs` | Full project check |
| `scripts/api-dev.mjs` | API dev runner |
| `scripts/backup-postgres.mjs` | `pg_dump` backup (`pnpm db:backup`) |
| `scripts/win.ps1` | Windows PATH / bootstrap / dev helpers |
| `scripts/native-windows.ps1` | Windows without Docker (hosted or local Postgres) |
| `scripts/run.cmd` | Windows command shim |
