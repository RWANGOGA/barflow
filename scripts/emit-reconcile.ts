import { mkdirSync, writeFileSync } from 'node:fs'
import { is, SQL } from 'drizzle-orm'
import { getTableConfig, PgTable, type PgColumn } from 'drizzle-orm/pg-core'
import * as schema from '../lib/db/schema'

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
  PgDateString: 'date',
  PgTimestamp: 'timestamp with time zone',
  PgJsonb: 'jsonb',
  PgJson: 'json',
  PgNumeric: 'numeric',
  PgUUID: 'uuid',
  PgReal: 'real',
  PgDoublePrecision: 'double precision',
}

function sqlType(column: PgColumn) {
  const type = SQL_TYPES[column.columnType]
  if (!type) throw new Error(`No SQL mapping for ${column.columnType} (${column.name}). Add it before generating.`)
  return type
}

function defaultSql(column: PgColumn): string | null {
  if (column.defaultFn) {
    if (column.columnType === 'PgUUID') return 'gen_random_uuid()'
    if (column.columnType.startsWith('PgTimestamp')) return 'now()'
    throw new Error(`Unknown default function for ${column.columnType} (${column.name}).`)
  }
  const value = column.default
  if (value === undefined) return null
  // .defaultNow() and .defaultRandom() store an SQL template, not a primitive.
  if (is(value, SQL)) {
    const chunks = (value as unknown as { queryChunks?: { value?: unknown }[] }).queryChunks ?? []
    const text = chunks
      .map((chunk) => (Array.isArray(chunk.value) ? chunk.value.join('') : typeof chunk.value === 'string' ? chunk.value : ''))
      .join('')
      .trim()
    if (!text) throw new Error(`Cannot render SQL default for ${column.name}.`)
    return text
  }
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (column.columnType === 'PgJsonb') return "'{}'::jsonb"
  return null
}

const blocks: string[] = []

for (const value of Object.values(schema)) {
  if (!is(value, PgTable)) continue
  const config = getTableConfig(value)
  const table = config.name
  if (!table) continue

  const primary = config.primaryKeys[0]?.columns.map((column) => `"${column.name}"`) ?? []
  const lines = config.columns.map((column) => {
    const fallback = defaultSql(column)
    const notNull = column.notNull ? ' NOT NULL' : ''
    return `  "${column.name}" ${sqlType(column)}${fallback ? ` DEFAULT ${fallback}` : ''}${notNull}`
  })
  if (primary.length) lines.push(`  PRIMARY KEY (${primary.join(', ')})`)

  blocks.push(`CREATE TABLE IF NOT EXISTS "${table}" (\n${lines.join(',\n')}\n);`)

  for (const column of config.columns) {
    if (column.primary) continue
    const fallback = defaultSql(column)
    const notNull = column.notNull && fallback ? ' NOT NULL' : ''
    blocks.push(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column.name}" ${sqlType(column)}${fallback ? ` DEFAULT ${fallback}` : ''}${notNull};`)
  }

  if (table === 'bar_day') {
    blocks.push(`CREATE UNIQUE INDEX IF NOT EXISTS "bar_day_one_open_idx" ON "bar_day" USING btree ("user_id") WHERE "bar_day"."status" = 'open';`)
  }
}

const output = [
  '-- Idempotent reconciliation for a barflow database that was provisioned before the',
  '-- migration pipeline existed. Generated from lib/db/schema.ts — do not edit by hand;',
  '-- regenerate with `pnpm db:reconcile` after changing the schema.',
  '-- Safe to run on a database that already has some or all of these objects.',
  '',
  ...blocks.flatMap((block) => [block, '']),
].join('\n')

mkdirSync('drizzle/adopt', { recursive: true })
writeFileSync('drizzle/adopt/reconcile-existing-database.sql', output)
console.log(`wrote ${blocks.length} statements across ${Object.values(schema).filter((value) => is(value, PgTable)).length} tables`)
