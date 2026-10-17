import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import {
  auditLogs,
  discounts,
  products,
  receipts,
  saleItems,
  sales,
  stockCounts,
  stockDeliveries,
  stockMovements,
  stockTransfers,
  tabs,
  teamMembers,
  tradingDays,
  varianceHistory,
  varianceTolerances,
} from '@/lib/db/schema'

const TABLE_MAP = {
  bar_product: products,
  bar_sale: sales,
  bar_sale_item: saleItems,
  bar_stock_movement: stockMovements,
  bar_tab: tabs,
  bar_team_member: teamMembers,
  bar_audit_log: auditLogs,
  bar_receipts: receipts,
  bar_day: tradingDays,
  bar_stock_delivery: stockDeliveries,
  bar_stock_transfer: stockTransfers,
  bar_stock_count: stockCounts,
  bar_variance_tolerance: varianceTolerances,
  bar_variance_history: varianceHistory,
  bar_discount: discounts,
} as const

export async function GET(request: Request) {
  try {
    const user = await requirePermission('reports.read')
    const url = new URL(request.url)
    const requestedTables = url.searchParams.get('tables')?.split(',') ?? []
    const allTables = Object.keys(TABLE_MAP) as (keyof typeof TABLE_MAP)[]
    const targetTables = requestedTables.length
      ? requestedTables.filter((table): table is keyof typeof TABLE_MAP => allTables.includes(table as keyof typeof TABLE_MAP))
      : allTables
    const chunks: string[] = []
    const exportedAt = new Date().toISOString().slice(0, 10)
    chunks.push(`Barflow Data Export\nExported: ${exportedAt}\nUser: ${user.id}\n\n`)

    for (const table of targetTables) {
      try {
        const tableObject = TABLE_MAP[table]
        const rows = table === 'bar_team_member'
          ? await db.select({ id: teamMembers.id, userId: teamMembers.userId, name: teamMembers.name, role: teamMembers.role, createdAt: teamMembers.createdAt }).from(teamMembers).where(eq(teamMembers.userId, user.id)).limit(10000)
          : await db.select().from(tableObject).where(eq(tableObject.userId, user.id)).limit(10000)

        if (rows.length === 0) continue

        const columns = Object.keys(rows[0])
        chunks.push(`--- TABLE: ${table} ---`, columns.join(','))
        for (const row of rows) {
          const record = row as Record<string, unknown>
          chunks.push(columns.map((column) => {
            const value = record[column]
            return value == null ? '' : JSON.stringify(value).replaceAll('"', '""')
          }).join(','))
        }
        chunks.push('')
      } catch (error) {
        console.error(`Could not export ${table}`, error)
        return NextResponse.json({ error: 'Could not export requested data' }, { status: 500 })
      }
    }

    return new NextResponse(chunks.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=barflow-export-${exportedAt}.csv`,
      },
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not export data' }, { status: 500 })
  }
}
