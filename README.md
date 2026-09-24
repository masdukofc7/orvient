# Orvient

A product of [Distrofy Enterprises](https://distrofyent.com).

API-first inventory, invoicing, and POS for wholesale / retail ops.

**Stack:** pnpm 9 + Turborepo · NestJS 10 API · Next.js 15 web · Prisma 6 · PostgreSQL · Redis (optional cache)

---

## Project structure

```
inventory management/
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
│   └── Caddyfile            # optional TLS reverse proxy
├── scripts/                 # setup, check, Windows helpers
├── .github/workflows/ci.yml
├── docker-compose.yml       # local: postgres, redis, api, web
├── docker-compose.prod.yml  # prod: + Caddy, no DB/Redis host ports
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```



### Apps


| Package          | Path       | Role                     |
| ---------------- | ---------- | ------------------------ |
| `@inventory/api` | `apps/api` | REST API under `/api/v1` |
| `@inventory/web` | `apps/web` | Browser UI (port 3000)   |




### Packages


| Package               | Path                | Role                                                    |
| --------------------- | ------------------- | ------------------------------------------------------- |
| `@inventory/shared`   | `packages/shared`   | Zod validation schemas, session/JWT types, role helpers |
| `@inventory/database` | `packages/database` | Prisma client, migrations, seed                         |
| `@inventory/config`   | `packages/config`   | Shared TypeScript base config                           |


---



## Features (what exists today)


| Area                | Capabilities                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Auth**            | Signup / login (multi-org pick) / switch-org / refresh / logout / me · JWT · httpOnly cookies · role guards |
| **Products**        | CRUD · barcode lookup · barcode backfill · status filters                                                   |
| **Contacts**        | Customers & suppliers · CRUD                                                                                |
| **Inventory**       | Stock in / out / adjust · ledger · per-product history                                                      |
| **Purchase orders** | Create · list · detail · receive (partial/full) · cancel                                                    |
| **Invoices**        | Create · list · detail · payments · void                                                                    |
| **POS**             | Quick sale checkout                                                                                         |
| **Reports**         | Dashboard · sales · inventory · low stock · product history · customer purchases                            |
| **Org / users**     | Current org get/patch · user list/create/patch                                                              |
| **Health**          | `GET /health` (Postgres + Redis) · `GET /health/ready`                                                      |


**Not in this repo:** service worker / full offline PWA.

Authorization uses `MembershipRole` (`OWNER` | `ADMIN` | `MANAGER` | `CASHIER`). The `Role.permissions` DB field is unused metadata.

---



## Repository map (detail)



### API — `apps/api/src`

```
apps/api/src/
├── main.ts                 # bootstrap, CORS, helmet, Swagger (non-prod)
├── app.module.ts           # global guards, Pino, throttling
├── config/                 # production env validation + selfcheck
├── common/                 # guards, decorators, pipes, audit
├── infrastructure/
│   ├── prisma/
│   └── redis/              # optional cache (ioredis)
└── modules/
    ├── auth/
    ├── products/
    ├── contacts/
    ├── inventory/
    ├── purchase-orders/
    ├── invoices/
    ├── pos/
    ├── reports/
    ├── organizations/      # org + users
    └── health/
```

**REST prefix:** `/api/v1`


| Module          | Routes                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | `POST /auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/switch-org` · `GET /auth/me`, `/auth/memberships`       |
| Products        | `GET/POST /products` · `GET /products/by-barcode/:code` · `GET/PATCH/DELETE /products/:id` · `POST /products/backfill-barcodes`     |
| Contacts        | `GET/POST /contacts` · `GET/PATCH/DELETE /contacts/:id`                                                                             |
| Inventory       | `POST /inventory/stock-in|stock-out|adjust` · `GET /inventory/ledger` · `GET /inventory/history/:productId`                         |
| Purchase orders | `GET/POST /purchase-orders` · `GET /purchase-orders/:id` · `POST /purchase-orders/:id/receive` · `POST /purchase-orders/:id/cancel` |
| Invoices        | `GET/POST /invoices` · `GET /invoices/:id` · `POST /invoices/:id/payments` · `POST /invoices/:id/void`                              |
| POS             | `POST /pos/quick-sale`                                                                                                              |
| Reports         | `GET /reports/dashboard|sales|inventory|low-stock` · product history · customer purchases                                           |
| Org             | `GET/PATCH /organizations/current`                                                                                                  |
| Users           | `GET/POST /users` · `PATCH /users/:id`                                                                                              |
| Health          | `GET /health` · `GET /health/ready`                                                                                                 |


Swagger (dev / non-prod only): [http://localhost:4000/api/docs](http://localhost:4000/api/docs)  
Force in production with `ENABLE_SWAGGER=true`.

### Web — `apps/web`

```
apps/web/
├── middleware.ts            # session cookie gate (inv_session / accessToken)
├── public/                  # favicon, manifest.webmanifest
└── src/
    ├── app/
    │   ├── login/
    │   ├── page.tsx         # root redirect
    │   └── (app)/           # authenticated shell
    │       ├── dashboard/
    │       ├── pos/
    │       ├── products/
    │       ├── contacts/
    │       ├── inventory/
    │       ├── invoices/    # list + [id]
    │       ├── reports/
    │       └── settings/
    ├── components/          # layout, UI primitives, command palette
    ├── lib/                 # api client, auth-token, nav, utils
    ├── stores/              # Zustand (auth memory session, POS draft)
    └── hooks/
```


| Route                         | Page                     |
| ----------------------------- | ------------------------ |
| `/login`                      | Sign in                  |
| `/dashboard`                  | Metrics overview         |
| `/pos`                        | Point of sale            |
| `/products`                   | Product catalog          |
| `/contacts`                   | Customers / suppliers    |
| `/inventory`                  | Stock movements (staff+) |
| `/invoices`, `/invoices/[id]` | Invoices                 |
| `/reports`                    | Reports                  |
| `/settings`                   | Org / users (staff+)     |


Access token lives in **memory** (not `localStorage`). Refresh uses an httpOnly cookie. Middleware checks `inv_session` (or same-origin `accessToken` cookie).

### Database — `packages/database`

Prisma models: `Organization`, `Branch`, `User`, `Role`, `Membership`, `RefreshToken`, `Product`, `Contact`, `DocumentSequence`, `Invoice`, `InvoiceItem`, `InventoryTransaction`, `AuditLog`.

Migrations live under `packages/database/prisma/migrations/`. Seed: `packages/database/prisma/seed.ts` (demo org + admin).

### Shared — `packages/shared`

Zod schemas for login, products, contacts, inventory, invoices, POS, org/users, pagination; plus `SessionUser` / `JwtAuthUser` types and role helpers (`isStaffRole`, `isOwnerAdminRole`).

---



## Prerequisites

- **Node.js 22+**
- **pnpm 9** (`corepack enable` or `npx pnpm@9.15.0`)
- **Docker Desktop** for local Postgres/Redis (or a hosted Postgres — see Windows notes below)

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


| Service | URL                                                              |
| ------- | ---------------------------------------------------------------- |
| Web     | [http://localhost:3000](http://localhost:3000)                   |
| API     | [http://localhost:4000/api/v1](http://localhost:4000/api/v1)     |
| Swagger | [http://localhost:4000/api/docs](http://localhost:4000/api/docs) |


**Demo login** (seed only — change before real deploy):

- Email: `admin@inventory.local`
- Password: `Admin123!`



### Windows — PATH helpers

If `docker` / `npx` / `pnpm` are “not recognized”, refresh PATH:

```powershell
cd "E:\inventory management"
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\win.ps1 path
.\scripts\win.ps1 bootstrap
.\scripts\win.ps1 dev
```



### Windows without Docker

Use hosted Postgres (Neon) when virtualization is unavailable:

```powershell
.\scripts\native-windows.ps1 hosted
.\scripts\win.ps1 dev
```

Or attempt local Postgres: `.\scripts\native-windows.ps1 local`

---



## Commands


| Command                            | What it does                                                |
| ---------------------------------- | ----------------------------------------------------------- |
| `pnpm setup`                       | `.env` from example, install, build shared, generate Prisma |
| `pnpm setup:env`                   | Env files only                                              |
| `pnpm infra:up` / `infra:down`     | Start/stop Postgres + Redis containers                      |
| `pnpm db:setup`                    | Generate + migrate deploy + seed                            |
| `pnpm db:migrate`                  | Dev migrations                                              |
| `pnpm db:deploy`                   | Production migrate deploy                                   |
| `pnpm db:seed`                     | Seed demo data                                              |
| `pnpm db:studio`                   | Prisma Studio                                               |
| `pnpm db:reset`                    | Reset DB (destructive)                                      |
| `pnpm dev`                         | Shared watch + API + Web                                    |
| `pnpm dev:api` / `dev:web`         | Single app                                                  |
| `pnpm build`                       | Production builds                                           |
| `pnpm start:api` / `start:web`     | Run built apps                                              |
| `pnpm typecheck`                   | `tsc --noEmit` across packages                              |
| `pnpm test`                        | Package smoke checks (incl. API env selfcheck)              |
| `pnpm check`                       | Full validate + typecheck + builds                          |
| `pnpm docker:up`                   | Build & run **dev** Compose stack (migrate, **no** auto-seed)  |
| `pnpm docker:prod`                 | Build & run **prod** stack (Caddy TLS, DB not published)       |
| `pnpm docker:prod:seed`            | Seed inside prod API container                                 |
| `pnpm docker:seed`                 | One-shot seed in running API container                      |
| `pnpm docker:down` / `docker:logs` | Tear down / follow logs                                     |
| `pnpm test:db`                     | API DB selfchecks (tenant, billing, inventory, platform)    |


If `pnpm` is not on PATH: `npx pnpm@9.15.0 <script>`

---



## Environment

Copy `.env.example` → `.env` (`pnpm setup:env` does this). Setup also syncs copies for `apps/api`, `packages/database`, and creates `apps/web/.env.local` with `NEXT_PUBLIC_API_URL`.


| Variable                                     | Purpose                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                               | Postgres connection                                                       |
| `REDIS_URL` / `REDIS_DISABLED`               | Cache; set `REDIS_DISABLED=true` to skip Redis locally                    |
| `JWT_ACCESS_SECRET`                          | Access JWT secret (**≥32 chars**; production rejects placeholders)        |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | Token lifetimes                                                           |
| `API_PORT` / `API_HOST`                      | API listen address                                                        |
| `CORS_ORIGIN`                                | Comma-separated allowed origins (required in production)                  |
| `NEXT_PUBLIC_API_URL`                        | Browser-facing API base URL (bake before web Docker build)                |
| `NEXT_PUBLIC_APP_URL`                        | Public app origin for receipt links                                       |
| `COOKIE_SECURE`                              | Must be `true` in production; defaults to true if unset when prod         |
| `DOMAIN`                                     | Hostname for Caddy (`docker:prod`)                                        |
| `ENABLE_SWAGGER`                             | Force Swagger in production                                               |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`   | Demo seed credentials                                                     |


Compose also accepts `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`.

---



## Docker deploy

**Local / demo** (ports open, no TLS):

```bash
pnpm setup:env
# set JWT_ACCESS_SECRET (≥32, not a placeholder)
pnpm docker:up
pnpm docker:seed   # first boot only
```

**Production** (`docker-compose.prod.yml`: no DB/Redis host ports, Caddy TLS, `COOKIE_SECURE=true`):

```bash
# Required in .env:
#   DOMAIN=app.example.com
#   CORS_ORIGIN=https://app.example.com
#   NEXT_PUBLIC_API_URL=https://app.example.com/api/v1
#   NEXT_PUBLIC_APP_URL=https://app.example.com
#   JWT_ACCESS_SECRET=<openssl rand -base64 48>
#   POSTGRES_PASSWORD=<strong unique password>
#   COOKIE_SECURE=true
pnpm docker:prod
pnpm docker:prod:seed   # first boot only — then change SEED_ADMIN_PASSWORD
```

Compose prod services: `postgres`, `redis`, `api` (migrate + start), `web`, `caddy` (80/443).

**TLS:** Caddy terminates HTTPS. Point DNS at the host; set `DOMAIN`.

---



## Production checklist

1. Strong `JWT_ACCESS_SECRET` (≥32 chars, **not** a `change-me` placeholder — API refuses to boot otherwise)
2. Non-default `POSTGRES_PASSWORD` (default `inventory/inventory` refused in production)
3. `COOKIE_SECURE=true` (required when `NODE_ENV=production`)
4. Use `pnpm docker:prod` (or equivalent): TLS via Caddy, DB/Redis not published
5. `pnpm db:deploy` / migrate on release; seed **once**, then rotate seed admin password
6. Back up the Postgres volume regularly
7. Redis is cache-only — ephemeral is fine; `/health` may report `degraded` if Redis is down
8. Swagger off in production unless `ENABLE_SWAGGER=true`
9. Past-due subscriptions are blocked after grace (billing/auth/platform routes stay open)

---



## Architecture notes

- **Monorepo:** `apps/`* + `packages/*` via pnpm workspaces; Turborepo for `dev` / `build` / `typecheck` / `test`
- **API style:** Nest feature modules with application / presentation / infrastructure layers where split exists
- **Tenancy:** multi-tenant SaaS — `organizationId` on domain rows; self-serve signup creates an org; JWT scopes the session; switch-org for multi-membership users
- **Stock source of truth:** `InventoryTransaction` ledger
- **Invoices:** multi-currency support via org default + invoice currency fields
- **CI:** `.github/workflows/ci.yml` — install → Prisma validate → typecheck → test → build

---



## Scripts folder


| Script                       | Purpose                                           |
| ---------------------------- | ------------------------------------------------- |
| `scripts/setup.mjs`          | Env + install + shared/db bootstrap               |
| `scripts/check.mjs`          | Full project check                                |
| `scripts/api-dev.mjs`        | API dev runner                                    |
| `scripts/win.ps1`            | Windows PATH / bootstrap / dev helpers            |
| `scripts/native-windows.ps1` | Windows without Docker (hosted or local Postgres) |
| `scripts/run.cmd`            | Windows command shim                              |


