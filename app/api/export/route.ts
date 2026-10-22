import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { addDays, BAR_TIME_ZONE, startOfDay } from '@/lib/time'
import { createZip } from '@/lib/zip'
import { db } from '@/lib/db'
import {
  auditLogs,
  discounts,
  inventoryCounts,
  menuStockLinks,
  products,
  receipts,
  saleItems,
  salePayments,
  sales,
  stockAdjustments,
  stockCounts,
  stockDeliveries,
  stockMovements,
  stockTransfers,
  tabItems,
  tabs,
  teamMembers,
  tradingDays,
  varianceHistory,
  varianceTolerances,
} from '@/lib/db/schema'

const ROW_LIMIT = 10000

type ExportEntry = {
  /** File-name friendly name; also used for the CSV inside the archive. */
  label: string
  table: PgTable
  userId: AnyPgColumn
  dateColumn?: AnyPgColumn
  /** Timestamp columns filter on an instant, date columns on a calendar day. */
  dateKind?: 'timestamp' | 'date'
  /** Columns that must never leave the server in a download. */
  omit?: string[]
}

const TABLES: Record<string, ExportEntry> = {
  bar_product: { label: 'products', table: products, userId: products.userId, dateColumn: products.createdAt },
  bar_sale: { label: 'sales', table: sales, userId: sales.userId, dateColumn: sales.createdAt },
  bar_sale_item: { label: 'sale-items', table: saleItems, userId: saleItems.userId, dateColumn: saleItems.createdAt },
  bar_sale_payment: { label: 'sale-payments', table: salePayments, userId: salePayments.userId, dateColumn: salePayments.createdAt },
  bar_tab: { label: 'tabs', table: tabs, userId: tabs.userId, dateColumn: tabs.openedAt },
  bar_tab_item: { label: 'tab-items', table: tabItems, userId: tabItems.userId, dateColumn: tabItems.createdAt },
  bar_stock_movement: { label: 'stock-movements', table: stockMovements, userId: stockMovements.userId, dateColumn: stockMovements.createdAt },
  bar_stock_delivery: { label: 'deliveries', table: stockDeliveries, userId: stockDeliveries.userId, dateColumn: stockDeliveries.deliveryDate, dateKind: 'date' },
  bar_stock_transfer: { label: 'transfers', table: stockTransfers, userId: stockTransfers.userId, dateColumn: stockTransfers.createdAt },
  bar_stock_count: { label: 'stock-counts', table: stockCounts, userId: stockCounts.userId, dateColumn: stockCounts.countedAt },
  bar_inventory_count: { label: 'inventory-counts', table: inventoryCounts, userId: inventoryCounts.userId, dateColumn: inventoryCounts.createdAt },
  bar_stock_adjustment: { label: 'stock-adjustments', table: stockAdjustments, userId: stockAdjustments.userId, dateColumn: stockAdjustments.createdAt },
  bar_menu_stock_link: { label: 'menu-stock-links', table: menuStockLinks, userId: menuStockLinks.userId, dateColumn: menuStockLinks.createdAt },
  bar_day: { label: 'trading-days', table: tradingDays, userId: tradingDays.userId, dateColumn: tradingDays.businessDate, dateKind: 'date' },
  bar_discount: { label: 'discounts', table: discounts, userId: discounts.userId, dateColumn: discounts.createdAt },
  bar_receipts: { label: 'receipts', table: receipts, userId: receipts.userId, dateColumn: receipts.createdAt },
  bar_team_member: { label: 'team-members', table: teamMembers, userId: teamMembers.userId, dateColumn: teamMembers.createdAt, omit: ['pin'] },
  bar_variance_tolerance: { label: 'variance-tolerances', table: varianceTolerances, userId: varianceTolerances.userId },
  bar_variance_history: { label: 'variance-history', table: varianceHistory, userId: varianceHistory.userId, dateColumn: varianceHistory.createdAt },
  bar_audit_log: { label: 'audit-log', table: auditLogs, userId: auditLogs.userId, dateColumn: auditLogs.createdAt },
}

/** ISO YYYY-MM-DD parsed at local noon so a day boundary lands on the bar's calendar date. */
function parseDay(value: string | null): Date | null | undefined {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T12:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date
    ? value.toISOString()
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

type LoadedTable = { entry: ExportEntry; columns: string[]; rows: Record<string, unknown>[] }

async function loadTable(userId: string, entry: ExportEntry, from: Date | null, to: Date | null): Promise<LoadedTable> {
  const filters: SQL[] = [eq(entry.userId, userId)]

  if (entry.dateColumn && entry.dateKind === 'date') {
    if (from) filters.push(sql`${entry.dateColumn} >= ${from.toISOString().slice(0, 10)}`)
    if (to) filters.push(sql`${entry.dateColumn} <= ${to.toISOString().slice(0, 10)}`)
  } else if (entry.dateColumn) {
    if (from) filters.push(sql`${entry.dateColumn} >= ${startOfDay(from)}`)
    if (to) filters.push(sql`${entry.dateColumn} < ${addDays(startOfDay(to), 1)}`)
  }

  const base = db.select().from(entry.table).where(and(...filters))
  const query = entry.dateColumn ? base.orderBy(asc(entry.dateColumn)).limit(ROW_LIMIT) : base.limit(ROW_LIMIT)
  const rows = (await query) as Record<string, unknown>[]
  if (entry.omit?.length) {
    for (const row of rows) for (const column of entry.omit) delete row[column]
  }

  const columns = Object.keys(getTableColumns(entry.table)).filter((column) => !entry.omit?.includes(column))
  return { entry, columns, rows }
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission('reports.read')
    const url = new URL(request.url)
    const requested = url.searchParams.get('tables')?.split(',').filter(Boolean) ?? []
    const unknown = requested.filter((name) => !TABLES[name])
    if (unknown.length) {
      return NextResponse.json({ error: `Unknown table: ${unknown.join(', ')}` }, { status: 400 })
    }

    const selected = requested.length ? requested : Object.keys(TABLES)
    const from = parseDay(url.searchParams.get('from'))
    const to = parseDay(url.searchParams.get('to'))
    if (from === undefined || to === undefined) {
      return NextResponse.json({ error: 'Dates must use YYYY-MM-DD' }, { status: 400 })
    }
    if (from && to && from > to) {
      return NextResponse.json({ error: 'The start date must be on or before the end date' }, { status: 400 })
    }

    const loaded = await Promise.all(selected.map((name) => loadTable(user.id, TABLES[name], from, to)))
    const rangeTag = from && to
      ? `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`
      : from
        ? `from_${from.toISOString().slice(0, 10)}`
        : to
          ? `to_${to.toISOString().slice(0, 10)}`
          : 'all-time'

    if (loaded.length === 1) {
      const [only] = loaded
      return new NextResponse(toCsv(only.rows, only.columns), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="barflow-${only.entry.label}-${rangeTag}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const manifest = [
      'Barflow data export',
      `Workspace: ${user.workspaceName} (${user.workspaceId})`,
      `Exported by: ${user.name ?? user.email} (${user.role})`,
      `Generated: ${new Date().toISOString()}`,
      `Time zone: ${BAR_TIME_ZONE}`,
      `Range: ${from ? from.toISOString().slice(0, 10) : 'start'} to ${to ? to.toISOString().slice(0, 10) : 'today'}`,
      `Row limit: ${ROW_LIMIT} per table`,
      '',
      'Rows per table:',
      ...loaded.map((table) => `- ${table.entry.label}: ${table.rows.length}${table.rows.length === ROW_LIMIT ? ' (limit reached)' : ''}`),
      '',
    ].join('\r\n')

    const archive = createZip([
      { name: 'manifest.txt', data: manifest },
      ...loaded.map((table) => ({ name: `${table.entry.label}.csv`, data: toCsv(table.rows, table.columns) })),
    ])

    return new NextResponse(new Blob([archive]), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="barflow-export-${rangeTag}.zip"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not export data' }, { status: 500 })
  }
}
