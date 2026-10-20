# Barflow

Barflow is a role-aware bar management system built with Next.js 16, React 19, Better Auth, Neon PostgreSQL, Drizzle ORM, and Tailwind CSS.

## What is implemented

- Email/password authentication with protected dashboard access.
- Role-aware navigation for Admin, Manager, Cashier, and Storekeeper users.
- Time-aware dashboard greetings that match the current local hour.
- Overview metrics backed by Neon: sales, orders, open tabs, weekly sales, and checklist progress.
- New sale flow with catalogue search, category filters, cart quantities, payment selection, and server persistence.
- Open tabs backed by Neon, including authenticated listing and settlement.
- Product catalogue and stock views loaded from Neon rather than hardcoded sample products.
- Daily close workflow with opening float, counted cash, close state, and authenticated persistence.
- Team member management backed by Neon with role and PIN validation.
- Audit log storage and authenticated audit queries.
- Reports backed by sales data, with print and CSV export actions.
- Settings screen with a Better Auth sign-out control.
- Responsive desktop sidebar and mobile bottom navigation.

## Architecture and data flow

```text
Sign in / Sign up
        |
        v
Better Auth session cookie
        |
        v
Protected dashboard + role-aware navigation
        |
        +--> Overview      --> /api/overview --> Neon sales, tabs, stock, day data
        +--> New sale      --> /api/sales    --> Neon sale records
        +--> Open tabs     --> /api/tabs     --> Neon bar_tab records
        +--> Stock         --> /api/products and /api/stock --> Neon products and movements
        +--> Daily close   --> /api/day      --> Neon bar_day records
        +--> Team          --> /api/team     --> Neon bar_team_member records
        +--> Audit         --> /api/audit    --> Neon bar_audit_log records
        +--> Reports       --> /api/reports  --> Neon sales aggregations
```

Every user-owned query is scoped to the authenticated Better Auth user ID. UI role filtering is complemented by server-side session checks in the API routes.

## Database entities

The Drizzle schema in `lib/db/schema.ts` includes Better Auth tables plus:

- `products` — catalogue, prices, stock levels, reorder points, and costs.
- `sales` — sale totals, payment method, and operator ownership.
- `stockMovements` — inventory movement history.
- `tradingDays` — opening and closing reconciliation state.
- `tabs` — open and settled customer tabs.
- `teamMembers` — staff records and assigned roles.
- `auditLogs` — durable action and approval history.

## Local development

Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required environment variables

Copy `.env.example` to `.env.local`, then replace the placeholders:

- `BETTER_AUTH_URL`: the app origin (`http://localhost:3000` for local development; the canonical HTTPS origin in production). For Vercel, set the correct URL in each deployment environment.
- `BETTER_AUTH_SECRET`: a private random secret of at least 32 characters. Generate one with `openssl rand -base64 32`.
- `DATABASE_URL`: the private Neon pooled PostgreSQL connection for Next.js and FastAPI runtime. Set the same value in Vercel and Render.
- `NEON_MIGRATION_DATABASE_URL`: optional direct Neon connection for local migrations; GitHub Actions uses the repository secret of the same name.
- `BACKEND_URL`: the FastAPI backend origin, read only on the server. The browser calls the same-origin `/api/backend` proxy, which forwards the session cookie to FastAPI.

Set `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` in every Vercel environment that builds or runs the app. The auth module fails fast with a clear configuration error if either value is missing; there is no service-role-key fallback. Never commit `.env.local` or production secrets.

New self-registered accounts receive the `Cashier` role, the least-privileged role supported by RBAC. The first owner account is promoted by the one-time token-gated `pnpm db:admin` CLI below; no direct SQL is required.

The new Neon baseline in `drizzle/migrations/` includes the `Cashier` default. Existing `backend/migrations/` and `supabase/migrations/` directories are historical and are not replayed against Neon.

### Local database and FastAPI

Next.js and the FastAPI service can share any plain Postgres instance for development. A container keeps the data across restarts:

```bash
docker run -d --name barflow-postgres -p 55432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=barflow_dev \
  postgres:16-alpine
```

Point `DATABASE_URL` and `NEON_MIGRATION_DATABASE_URL` at that database, then:

```bash
pnpm db:migrate     # apply drizzle/migrations to the local database
pnpm db:info        # target, TLS, row count per table, applied migrations
pnpm db:schema      # compare the live columns with lib/db/schema.ts
pnpm db:seed        # demo catalogue, roster, and settings for the first Admin
pnpm backend:dev    # FastAPI on http://127.0.0.1:8000 against the same database
```

`pnpm db:schema` exits non-zero when the connected database is missing a table or column the running app reads, and `--sql` prints the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements to reconcile it. Run it against Neon after every deploy that touches `lib/db/schema.ts`. A `Failed query: select ...` toast is usually this drift; the API now returns the underlying Postgres message instead.

`pnpm db:reconcile` regenerates `drizzle/adopt/reconcile-existing-database.sql` from `lib/db/schema.ts`. That file is idempotent and never drops data, so it can be pasted into the Neon SQL editor when a database was provisioned before the migration ledger existed.

`pnpm db:info` never prints the password, and `pnpm db:seed` refuses to run against a non-local host unless `--allow-remote` is passed. Inspect the data directly with `docker exec -it barflow-postgres psql -U postgres -d barflow_dev`, then `\dt` for tables and `\d bar_sale` for one table's columns.

Local `BACKEND_URL` must be `http://127.0.0.1:8000`. The browser calls the same-origin `/api/backend` proxy, which forwards the session cookie, so Next.js and FastAPI must share one database for authenticated calls to succeed. Sign up once, give that account the `Admin` role, and run `pnpm db:seed`.

### Neon migrations and deployment

- Generate and review a migration locally with `pnpm db:generate`.
- Check the target connection with `pnpm db:check`.
- Apply locally with `pnpm db:migrate`; the initial baseline refuses to run if public tables already exist without Drizzle migration history.
- The GitHub Actions workflow `.github/workflows/neon-migrate.yml` applies committed migrations automatically on pushes to `main`. Configure repository secret `NEON_MIGRATION_DATABASE_URL` with the Neon **direct** connection string before pushing migration changes. The job does not print the secret; it fails closed if the secret is missing.
- Set `DATABASE_URL` in both the Vercel (Next.js) and Render (FastAPI) environments to the same Neon **pooled** runtime connection string. The FastAPI asyncpg pool disables prepared-statement caching for PgBouncer transaction pooling.
- Do not use `drizzle-kit push`; the checked-in migration history is the reviewed deployment source.

### One-time first Admin provisioning

1. Create the owner account through the normal sign-up flow; new accounts have the `Cashier` role.
2. Generate a 32-byte one-time token with `pnpm db:token -- --email=owner@example.com`. It expires in 15 minutes. Store the raw token securely; set its printed email, SHA-256 digest, and expiry in local `ADMIN_PROVISIONING_EMAIL`, `ADMIN_PROVISIONING_TOKEN_HASH`, and `ADMIN_PROVISIONING_TOKEN_EXPIRES_AT`.
3. Run `pnpm db:admin -- --email=owner@example.com` from an interactive terminal. Enter the token when prompted; input is hidden. The command promotes only that existing Cashier, refuses if any Admin exists, enforces single-use in the database, and writes an audit event transactionally.
4. Remove all three temporary `ADMIN_PROVISIONING_*` values from `.env.local` after success. The raw token is never stored in the database.

Provisioning uses the same Neon database connection and never creates or handles a password. It is intended only for the first owner account; subsequent role changes remain subject to the established RBAC and administrative process. This bootstrap CLI stores only a token hash and marks each token consumed transactionally.

## Verification

Run the production build with the required environment variables configured before merging or deploying:

```bash
pnpm build
```

Use the dashboard preview to verify sign-in, role-based navigation, sales persistence, tab settlement, stock loading, daily close, reports, team management, audit records, responsive navigation, and Settings sign-out.

## Project structure

- `app/dashboard/page.tsx` — protected dashboard shell and feature views.
- `app/api/**/route.ts` — authenticated server routes for application workflows.
- `lib/auth.ts` and `lib/auth-client.ts` — Better Auth server/client configuration.
- `lib/db/schema.ts` — Drizzle database schema.
- `lib/db/index.ts` — Neon database connection.
- `FEATURES_IMPLEMENTED.md` — detailed implementation and integration report.

## v0 project

This repository is connected to the v0 project:

https://v0.app/chat/projects/prj_TXvaCLA5Z5k6ZI5KHj6uTQE7cyM5

Every merge to `main` can deploy through the connected Vercel project.
