# Barflow Frontend Feature Report

Date: 15 October 2026

## Implemented workflows

- Overview dashboard with live low-stock count and responsive navigation.
- New sale flow with category filtering, search, cart quantities, payment selection, and confirmation feedback.
- Open tabs with responsive View and Settle dialogs, tab removal after settlement, and Add items navigation.
- Menu & prices with add-item form, validation, editable price/cost/stock/reorder fields, and live catalogue updates.
- Stock & deliveries with live inventory rendering and delivery receiving controls.
- Team & permissions with add-member dialog, role selection, PIN validation, and access summary.
- Reports with CSV download and print-ready PDF export.
- Daily close with close confirmation, locked-day state, and Open new day workflow.
- Audit log and Settings screens remain available through role-based navigation.

## Responsive behavior

- Mobile-first layouts use stacked cards, horizontal table scrolling, responsive dialogs, and a mobile navigation drawer.
- Primary controls use labelled buttons and accessible dialog/status attributes.
- Desktop layouts expand into multi-column dashboard and management views.

## Requirements coverage

The frontend now covers the primary Must workflows from the requirements document: order entry, tabs, menu management, stock visibility, deliveries, daily close, reports, role-oriented screens, and responsive cashier/manager workflows.

## Known boundaries

- Data is currently held in client state for the prototype; production persistence, authentication, audit immutability, offline sync, backups, and hardware ESC/POS printing require a backend/device integration.
- Browser print is used for PDF/receipt flows. Direct thermal printing requires a local print bridge or network printer service.
- Stock movements, void approval, physical stock counts, wastage, mixed payments, and tax configuration need backend-backed records before production use.

## Validation

- Requirements document parsed with Mammoth before implementation.
- Preview interaction checks performed for reports, tabs, day close, menu, team, and responsive navigation.
- Production build should be run before merge/deployment.

## AI visibility

No AI assistant, AI-generated content, or AI-facing product visibility is included in the Barflow frontend.
