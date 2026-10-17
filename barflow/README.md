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

The application requires the project environment variables supplied by Vercel/Neon, including `DATABASE_URL` and `BETTER_AUTH_SECRET`. Do not commit secrets.

## Verification

Run the production build before merging or deploying:

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
