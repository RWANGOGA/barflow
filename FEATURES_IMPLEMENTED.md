# Barflow Implementation Report

**Date:** October 15, 2026  
**Application:** Barflow bar management system

## Executive summary

Barflow is a protected, role-aware bar operations dashboard. Better Auth handles identity and sessions, Neon PostgreSQL stores operational records, Drizzle defines the database contract, and authenticated Next.js route handlers connect the UI to the database.

The dashboard supports the core operating loop: sign in, view live activity, create sales, manage open tabs, monitor inventory, close the trading day, manage staff, inspect audit events, and review reports.

## Authentication and authorization

### Authentication

- Sign-up and sign-in use Better Auth with email and password.
- Protected dashboard access depends on the authenticated session.
- Session identity is used for greetings, operator labels, and user-scoped queries.
- Settings includes a real sign-out action using the Better Auth client.
- Sign-out redirects the user to `/sign-in`.

### Roles

The dashboard recognizes four roles:

| Role | Main access |
|---|---|
| Admin | Full operational, reporting, team, audit, settings, and close access |
| Manager | Sales, tabs, stock, close, reports, menu, team, audit, and settings |
| Cashier | Overview, new sales, and open tabs |
| Storekeeper | Overview and stock/delivery workflows |

The sidebar is filtered by role. If a user reaches a page that is not allowed for their role, the dashboard redirects them to Overview. API routes also validate the session and scope records by the authenticated user ID; hiding a navigation item is not the security boundary.

## User-facing functionality

### Overview

- Live sales total for the current day.
- Live order count.
- Live open-tab count.
- Live weekly sales chart data.
- Live low-stock count.
- Live checklist progress.
- Time-aware greeting: morning before noon, afternoon before 18:00, and evening after 18:00.
- Responsive navigation: desktop left sidebar and mobile bottom navigation.

### New sale

- Product catalogue search.
- Category filtering.
- Add/remove products from the cart.
- Quantity adjustment.
- Payment method selection.
- Server-side sale persistence through `/api/sales`.
- Successful payment clears the cart and shows confirmation feedback.

### Open tabs

- Loads open tabs from Neon through `/api/tabs`.
- Displays table, owner, amount, and open time.
- Provides View and Settle flows.
- Settlement updates the Neon record and removes it from the open list.
- Empty state is database-driven rather than sample-data-driven.

### Menu and prices

- Product catalogue is loaded from `/api/products`.
- Product fields include category, price, cost, stock, reorder level, unit, and display tone.
- Add-item and edit-item interactions are available in the management view.
- The UI no longer relies on the previous hardcoded product catalogue.

### Stock and deliveries

- Inventory is loaded from Neon.
- Low-stock indicators use current stock and reorder thresholds.
- Delivery controls support receiving stock and showing movement feedback.
- `/api/stock` handles stock movement operations.

### Daily close

- Opening float and counted cash are submitted through `/api/day`.
- Trading-day status is persisted as open or closed.
- Closed state locks the operational close workflow until a new day is opened.
- Dashboard startup reads the saved trading-day state from Neon.

### Team and permissions

- Team members load from `/api/team`.
- New staff records validate name, role, and PIN requirements server-side.
- Team records are scoped to the signed-in account.
- The assigned role controls dashboard navigation.

### Reports

- `/api/reports` aggregates authenticated sales data.
- Overview totals and payment summaries are derived from persisted sales rather than fixed demo totals.
- Reports support print-ready output and CSV download in the interface.

### Audit log

- Audit records are stored in `bar_audit_log` and served read-only through `GET /api/audit`; there is no client-writable audit endpoint.
- Events are written transactionally by the route that performs the change: tab voids and settlements, discounts, price changes, deliveries, transfers, day close, settings edits, team additions, and approval PIN changes.
- Each record contains the action, entity, record label, reason, metadata, acting role, approval state, user ownership, and creation time.
- The audit view filters by period and action, shows loading, error, and empty states instead of fabricated rows, and expands an event to its reason, entity id, and metadata.

### Settings

- Settings retains operational configuration controls.
- Sign out is available directly in Settings.
- Sign-out displays a loading state, handles failure feedback, clears the Better Auth session, and redirects to sign-in.

## How the pieces connect

```text
Browser
  |
  | Better Auth sign-in/sign-up
  v
Session cookie + authenticated user
  |
  v
Dashboard shell
  |
  +-- role filter --> allowed navigation and page access
  |
  +-- fetch /api/overview --> live dashboard aggregates
  +-- fetch /api/products --> catalogue and inventory
  +-- POST /api/sales --> persisted sale and report totals
  +-- GET/PATCH /api/tabs --> open-tab lifecycle
  +-- POST /api/day --> trading-day reconciliation
  +-- GET/POST /api/team --> staff and permissions
  +-- GET/POST /api/audit --> action history
  +-- GET /api/reports --> reporting aggregates
  |
  v
Neon PostgreSQL through Drizzle ORM
```

### Database ownership model

All operational tables carry a `user_id` owner. Server routes retrieve the Better Auth session before reading or mutating records, then include the session user ID in their database filters. This prevents one signed-in account from reading another account's sales, tabs, products, staff, or audit data.

## Main API routes

| Route | Purpose |
|---|---|
| `/api/auth/[...all]` | Better Auth handler |
| `/api/overview` | Dashboard metrics and weekly activity |
| `/api/products` | Catalogue reads and product management |
| `/api/sales` | Create and read sales |
| `/api/stock` | Stock movements and delivery updates |
| `/api/day` | Open and close trading days |
| `/api/tabs` | Open-tab reads and settlement |
| `/api/team` | Staff reads and creation |
| `/api/audit` | Audit event reads and writes |
| `/api/reports` | Sales and payment aggregations |

## Responsive implementation

- Desktop uses a persistent left sidebar and multi-column cards.
- Mobile uses a horizontal bottom navigation bar with horizontally scrollable table content.
- Forms and dialogs collapse into single-column layouts.
- Tables retain readable minimum widths and scroll instead of breaking the viewport.
- Buttons use semantic labels and disabled/loading states.

## Validation performed

- Requirements documents were parsed with Mammoth before implementation.
- Production builds were run after major feature changes.
- Browser checks covered dashboard loading, mobile navigation, New Sale navigation, Settings navigation, live overview state, open tabs, team views, reports, audit views, and sign-out placement.
- The `products is not defined` runtime failure was fixed by restoring a safe module-level catalogue reference while retaining Neon as the actual data source.

## Known production considerations

- Direct ESC/POS thermal printing requires a printer bridge or network printer service; browser print remains the current fallback.
- Advanced physical counts, wastage workflows, mixed payments, tax rules, offline sync, and backup/restore should receive dedicated backend records before production rollout.
- Self-registered accounts default to the least-privileged supported role, Cashier. Unknown or missing database roles are denied by server-side RBAC; promote the initial owner with the one-time token-gated `pnpm db:admin` CLI.

## Files that define the implementation

- `app/dashboard/page.tsx` — dashboard shell, role-aware navigation, and feature UI.
- `app/api/` — authenticated data routes.
- `lib/auth.ts` and `lib/auth-client.ts` — Better Auth.
- `lib/db/schema.ts` — Drizzle schema and Barflow entities.
- `lib/db/index.ts` — Neon connection.
- `README.md` — setup and architecture overview.
