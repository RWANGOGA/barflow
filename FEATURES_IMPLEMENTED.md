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

Everything on this page is queried live from Postgres; there are no hardcoded or sample figures.

- Range selector: this day, this week, month, two months, mid year, or all time. Every panel and chart follows the selected range.
- KPI cards: today's sales with a delta against yesterday, range revenue with a delta against the equally long previous period, orders served with average order value, and open tabs with the outstanding amount.
- Six-stat strip: items sold, average order, discounts applied and their value, voided orders and their value, expected cash in the till, and low-stock count.
- Sales trend chart drawn from real sales rows, with granularity that follows the range: hourly for today, daily for week/month, weekly for two months, and monthly for mid year/all time. Hovering a bar shows revenue and order count.
- Payment mix bar with each method's amount and share of the range's revenue.
- Top products by revenue with quantity sold and a relative revenue bar.
- Recent activity listing the latest completed sales across all dates, with payment method, table, and time.
- Low stock list with reorder levels, capped at six items with a count of the rest.
- Manager checklist computed from stock, tabs, and the trading day: review low stock, settle open tabs, count the till at close, and trading day open.
- Cash drawer card for Admin/Manager: opening float, expected cash for the trading session, counted cash, and variance. A reopened day clears the previous count; a closed day keeps its frozen figures. Other roles see a dash instead of cash values.
- Auto-refreshes every 30 seconds, refreshes on any recorded activity (sale, tab, stock, day close), and offers a manual Refresh button. Out-of-order responses are discarded so an older fetch cannot overwrite a newer one.
- Honest failure handling: a failed query shows an error banner with Retry and keeps the last good snapshot; it never renders a zeroed dashboard that looks like real data.
- Day boundaries, chart buckets, and trading-day dates use the bar's own timezone (`BAR_TIMEZONE`, default `Africa/Kampala`), so a bar trading after midnight and a UTC server agree on "today".
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
- Stock changes are guarded writes: a sale, tab, or transfer only succeeds while enough stock remains, so two tills can never sell the same bottle or push stock negative.
- Deliveries validate whole-number cost and business-date values before they reach the database.
- `/api/stock` handles stock movement operations.

### Daily close

- Opening float and counted cash are submitted through `/api/day`.
- The open day wins over the calendar date, so a close after midnight still finds the session it belongs to.
- Expected cash is the opening float plus cash payments since the day opened, split-payment aware.
- A day cannot be closed twice: the second attempt is rejected instead of overwriting the first count.
- Closing requires no open tabs, and any cash variance needs an explanation.
- Trading-day status is persisted as open or closed, and a closed day locks sales, tabs, and discounts until a new day is opened.
- Dashboard startup reads the saved trading-day state from Neon.

### Team and permissions

- Team members load from `/api/team`.
- New staff records validate name, role, and PIN requirements server-side.
- Team records are scoped to the signed-in account.
- The assigned role controls dashboard navigation.

### Reports

- `/api/reports` aggregates authenticated sales for the last thirty local calendar days, split-payment aware and void-aware.
- `/api/reports/summary` groups by payment, category, and product for any business-date range; voided sales are excluded everywhere.
- `/api/reports/daily` reports the real cost of goods sold from each item's cost price, real discounts for the day, and that day's wastage. Nothing is estimated from a fixed ratio.
- Report boundaries are business dates in the bar's timezone, so a report for 21 October covers that local trading day rather than a UTC slice.
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
| `/api/overview` | Live range-aware analytics: revenue and order deltas, trend series, payment mix, top products, low stock, open tabs, cash drawer, recent sales, and checklist. Returns an error instead of a zeroed payload when a query fails |
| `/api/products` | Catalogue reads and product management |
| `/api/sales` | Create and read sales |
| `/api/stock` | Stock movements and delivery updates |
| `/api/day` | Open and close trading days |
| `/api/tabs` | Open-tab reads and settlement |
| `/api/team` | Staff reads and creation |
| `/api/audit` | Read-only audit event history; events are written by the routes that change data |
| `/api/reports` | Range-aware sales and payment aggregations, excluding voided sales |
| `/api/reports/summary` | Payment, category, and product breakdown for a business-date range |
| `/api/reports/daily` | Daily close figures with real cost of goods, discounts, and wastage |

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
