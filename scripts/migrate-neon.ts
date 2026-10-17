import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

config({ path: '.env.local' })
config()

async function main() {
  const connectionString = process.env.NEON_MIGRATION_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('Set NEON_MIGRATION_DATABASE_URL (preferred direct Neon endpoint) or DATABASE_URL before migrating.')
  }

  const pool = new Pool({ connectionString, max: 1 })
  try {
    const { rows: [tracking] } = await pool.query<{ migration_table: string | null }>(
      `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migration_table`,
    )
    let migrationCount = 0
    if (tracking?.migration_table) {
      const { rows: [count] } = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations',
      )
      migrationCount = Number(count?.count ?? 0)
    }

    // Only the initial baseline requires an empty public schema. Once the migration ledger
    // records an applied baseline, later committed migrations are safe to run in order.
    if (!tracking?.migration_table || migrationCount === 0) {
      const { rows: existingTables } = await pool.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        LIMIT 10
      `)
      if (existingTables.length > 0) {
        throw new Error(
          `Refusing to apply the initial baseline to a non-empty database without Drizzle migration history. Found: ${existingTables.map((row) => row.table_name).join(', ')}. Verify the target or prepare an adoption migration.`,
        )
      }
    }

    const db = drizzle(pool)
    await migrate(db, { migrationsFolder: './drizzle/migrations' })
    console.info('Committed Drizzle migrations applied successfully.')
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Neon migration failed.')
  process.exitCode = 1
})
