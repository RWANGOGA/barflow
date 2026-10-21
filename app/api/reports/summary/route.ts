import { and, eq, gte, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { databaseErrorResponse } from '@/lib/db-errors'
import { db } from '@/lib/db'
import { addDays, startOfDay } from '@/lib/time'
import { saleItems, sales } from '@/lib/db/schema'

/** A business date as the UTC instant of local midnight, or null when the value is not a date. */
function boundary(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return startOfDay(new Date(`${value}T12:00:00.000Z`))
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission('reports.read')
    const url = new URL(request.url)
    const from = boundary(url.searchParams.get('from'))
    const to = boundary(url.searchParams.get('to'))

    const conditions = [eq(sales.userId, user.id), eq(sales.status, 'completed'), eq(sales.voided, false)]
    if (from) conditions.push(gte(sales.createdAt, from))
    // `to` is a business date, so the range includes that whole local day.
    if (to) conditions.push(lt(sales.createdAt, addDays(to, 1)))

    // Sale lines are filtered in SQL: loading the whole item history to throw most of it away
    // gets slower every month.
    const [saleRows, items] = await Promise.all([
      db.select().from(sales).where(and(...conditions)),
      db
        .select({
          saleId: saleItems.saleId,
          productId: saleItems.productId,
          productName: saleItems.productName,
          category: saleItems.category,
          quantity: saleItems.quantity,
          lineTotal: saleItems.lineTotal,
        })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(and(eq(saleItems.userId, user.id), ...conditions)),
    ])

    const byPayment = Object.entries(saleRows.reduce<Record<string, number>>((result, sale) => {
      result[sale.paymentMethod] = (result[sale.paymentMethod] ?? 0) + sale.total
      return result
    }, {})).map(([payment_method, total]) => ({ payment_method, total }))
    const byCategory = Object.values(items.reduce<Record<string, { category: string; quantity: number; total: number }>>((result, item) => {
      const row = result[item.category] ?? { category: item.category, quantity: 0, total: 0 }
      row.quantity += item.quantity
      row.total += item.lineTotal
      result[item.category] = row
      return result
    }, {}))
    const byProduct = Object.values(items.reduce<Record<string, { product_id: string; product_name: string; category: string; quantity: number; total: number }>>((result, item) => {
      const row = result[item.productId] ?? { product_id: item.productId, product_name: item.productName, category: item.category, quantity: 0, total: 0 }
      row.quantity += item.quantity
      row.total += item.lineTotal
      result[item.productId] = row
      return result
    }, {}))
    const total = saleRows.reduce((sum, sale) => sum + sale.total, 0)

    return NextResponse.json({
      orders: saleRows.length,
      total,
      average_order: saleRows.length ? Math.round(total / saleRows.length) : 0,
      items_sold: items.reduce((sum, item) => sum + item.quantity, 0),
      by_payment: byPayment,
      by_category: byCategory,
      by_product: byProduct,
    })
  } catch (error) {
    return authErrorResponse(error) ?? databaseErrorResponse(error) ?? NextResponse.json({ error: 'Could not load report summary' }, { status: 500 })
  }
}
