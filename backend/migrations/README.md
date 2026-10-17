# Legacy FastAPI migrations (not used for new deployments)

These numbered migrations are retained for reference only. Do not replay them on the new Neon instance: the history contains duplicate numbering, an ordering failure in `007_sale_items.sql`, a broken trigger definition in `013_non_functional.sql`, and schema objects that do not match the final app.

The authoritative migration lineage for the new Neon database is `drizzle/migrations/`, generated from `lib/db/schema.ts` and applied with `pnpm db:migrate`. The old `supabase/migrations/` files are also historical and contain Supabase Auth RLS policies, so they are not applied to Neon.

For local inspection:

```bash
pnpm db:generate
pnpm db:typecheck
pnpm db:migrate
```

`db:migrate` requires `NEON_MIGRATION_DATABASE_URL` (preferred direct Neon connection) or `DATABASE_URL`. The initial baseline refuses to run against a public schema that already contains tables but has no Drizzle migration ledger. Never use `drizzle-kit push` for this project; it can drop objects not represented in the schema.
