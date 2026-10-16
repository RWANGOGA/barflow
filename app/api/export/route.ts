import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products, sales, saleItems, stockMovements, tabs, teamMembers, auditLogs, receipts, tradingDays, stockDeliveries, stockTransfers, stockCounts, varianceTolerances, varianceHistory, discounts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

const TABLE_MAP: Record<string, any> = {
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
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId()
    const url = new URL(request.url)
    const tables = url.searchParams.get('tables')
    const tableList = tables ? tables.split(',') : []
    const chunks: string[] = []
    const exportedAt = new Date().toISOString().slice(0, 10)
    chunks.push(`Barflow Data Export\nExported: ${exportedAt}\nUser: ${userId}\n\n`)
    const allTables = Object.keys(TABLE_MAP)
    const targetTables = tableList.length ? tableList.filter(t => allTables.includes(t)) : allTables
    for (const table of targetTables) {
      try {
        const tableObj = TABLE_MAP[table]
        const rows = await db.select().from(tableObj).where(eq(tableObj.userId, userId)).limit(10000)
        if (rows && rows.length > 0) {
          chunks.push(`--- TABLE: ${table} ---`)
          const cols = Object.keys(rows[0])
          chunks.push(cols.join(','))
          for (const row of rows) {
            chunks.push(cols.map(c => {
              const v = row[c]
              return v === null || v === undefined ? '' : JSON.stringify(v).replace(/"/g, '""')
            }).join(','))
          }
          chunks.push('')
        }
      } catch {
        continue
      }
    }
    const csv = chunks.join('\n')
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=barflow-export-${exportedAt}.csv`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
