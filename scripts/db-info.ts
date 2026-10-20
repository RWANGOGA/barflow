import { config } from 'dotenv'
import { Pool } from 'pg'

config({ path: '.env.local' })
config()

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal'])

function printTable(name: string, count: number) {
  console.info(`  ${name.padEnd(30)} ${String(count).padStart(7)} rows`)
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DATABASE_URL is not set. Add it to .env.local.')

  const url = new URL(connectionString)
  const isLocal = LOCAL_HOSTS.has(url.hostname)
  const pool = new Pool({ connectionString, max: 1 })

  try {
    const { rows: [identity] } = await pool.query<{ database: string; username: string; ssl: boolean }>(
      `SELECT current_database() AS database,
              current_user AS username,
              (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl`,
    )

    console.info(`Target   ${url.hostname}:${url.port || '5432'}${url.pathname}`)
    console.info(`Kind     ${isLocal ? 'local container' : 'REMOTE — writes will hit a real database'}`)
    if (identity) {
      console.info(`Identity ${identity.username}@${identity.database}, TLS ${identity.ssl ? 'on' : 'off'}`)
    }

    const { rows: tables } = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    )

    console.info(`\nTables (${tables.length})`)
    if (tables.length === 0) console.info('  none — run `pnpm db:migrate` first')
    for (const { table_name } of tables) {
      const quoted = `"${table_name.replaceAll('"', '""')}"`
      const { rows: [{ count }] } = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${quoted}`)
      printTable(table_name, count)
    }

    const ledger = await pool
      .query<{ created_at: string }>('SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at')
      .catch(() => null)

    console.info(`\nDrizzle migrations applied: ${ledger?.rows.length ?? 0}`)
    for (const row of ledger?.rows ?? []) {
      console.info(`  ${new Date(Number(row.created_at)).toISOString()}`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Database inspection failed.')
  process.exitCode = 1
})
