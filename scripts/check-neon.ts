import { config } from 'dotenv'
import { Pool } from 'pg'

config({ path: '.env.local' })
config()

async function main() {
  const connectionString = (process.env.NEON_MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL)?.trim()
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Set the Neon connection string in .env.local.')
  }

  const pool = new Pool({ connectionString, max: 1 })
  try {
    const { rows: [connection] } = await pool.query<{ database: string; currentUser: string; ssl: boolean }>(
      `SELECT current_database() AS database, current_user AS "currentUser", ssl
       FROM pg_stat_ssl
       WHERE pid = pg_backend_pid()`,
    )
    if (!connection) throw new Error('Connected, but no PostgreSQL SSL session was reported.')
    if (!connection.ssl) throw new Error('Neon connection did not report TLS; check which URL is configured.')
    console.info(`Connected to Neon database "${connection.database}" as "${connection.currentUser}" over TLS.`)
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Neon connection check failed.')
  process.exitCode = 1
})
