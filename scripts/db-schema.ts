import { config } from 'dotenv'
import { is } from 'drizzle-orm'
import { getTableConfig, PgTable, type PgColumn } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'
import * as schema from '../lib/db/schema'

config({ path: '.env.local' })
config()

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal'])

const SQL_TYPES: Record<string, string> = {
  PgText: 'text',
  PgVarchar: 'text',
  PgChar: 'text',
  PgInteger: 'integer',
  PgSmallInt: 'smallint',
  PgBigInt53: 'bigint',
  PgBigInt64: 'bigint',
  PgBoolean: 'boolean',
  PgDate: 'date',
  PgTimestamp: 'timestamp with time zone',
  PgJsonb: 'jsonb',
  PgJson: 'json',
  PgNumeric: 'numeric',
  PgUUID: 'uuid',
  PgReal: 'real',
  PgDoublePrecision: 'double precision',
}

/**
 * A column can only be added NOT NULL when PostgreSQL has something to put in existing rows.
 * Anything we cannot render faithfully is reported without a default so a human reviews it.
 */
function defaultSql(column: PgColumn): string | null {
  if (column.defaultFn) return column.columnType === 'PgUUID' ? 'gen_random_uuid()' : 'now()'
  const value = column.default
  if (value === undefined) return null
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function suggestion(table: string, column: PgColumn) {
  const type = SQL_TYPES[column.columnType]
  if (!type || column.primary) return `-- ${table}.${column.name}: add manually (${column.columnType})`
  const fallback = defaultSql(column)
  const constraint = column.notNull && fallback ? ' NOT NULL' : ''
  const nullable = column.notNull && !fallback ? ' -- app expects NOT NULL; backfill before enforcing' : ''
  return `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column.name}" ${type}${fallback ? ` DEFAULT ${fallback}` : ''}${constraint};${nullable}`
}

async function main() {
  const connectionString = (process.env.NEON_MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL)?.trim()
  if (!connectionString) throw new Error('Set DATABASE_URL (or NEON_MIGRATION_DATABASE_URL) before checking the schema.')

  const url = new URL(connectionString)
  const pool = new Pool({ connectionString, max: 1 })
  const withSql = process.argv.includes('--sql')

  try {
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'`,
    )
    const live = new Map<string, Set<string>>()
    for (const row of rows) {
      const columns = live.get(row.table_name) ?? new Set<string>()
      columns.add(row.column_name)
      live.set(row.table_name, columns)
    }

    console.info(
      `Target   ${url.hostname}:${url.port || '5432'}${url.pathname} (${LOCAL_HOSTS.has(url.hostname) ? 'local' : 'REMOTE'})`,
    )

    const missingTables: { name: string; columns: string[] }[] = []
    const missingColumns: { table: string; column: string; sql: string }[] = []

    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue
      const { name, columns } = getTableConfig(value)
      const known = live.get(name)
      if (!known) {
        missingTables.push({ name, columns: columns.map((column) => column.name) })
        continue
      }
      for (const column of columns) {
        if (!known.has(column.name)) missingColumns.push({ table: name, column: column.name, sql: suggestion(name, column) })
      }
    }

    missingTables.sort((a, b) => a.name.localeCompare(b.name))
    missingColumns.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`))

    if (!missingTables.length && !missingColumns.length) {
      console.info(`\nSchema matches lib/db/schema.ts across ${live.size} tables.`)
      return
    }

    if (missingTables.length) {
      console.info(`\nMissing tables (${missingTables.length}) — apply the committed migrations with \`pnpm db:migrate\``)
      for (const table of missingTables) console.info(`  ${table.name} (${table.columns.length} columns)`)
    }
    if (missingColumns.length) {
      console.info(`\nMissing columns (${missingColumns.length})`)
      for (const column of missingColumns) console.info(`  ${column.table}.${column.column}`)
    }

    if (withSql) {
      console.info('\nSuggested SQL (review before applying):')
      for (const column of missingColumns) console.info(`  ${column.sql}`)
    } else {
      console.info('\nRe-run with --sql for suggested ALTER statements.')
    }

    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Schema check failed.')
  process.exitCode = 1
})
