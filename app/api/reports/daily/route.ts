import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { databaseErrorResponse } from '@/lib/db-errors'
import { db } from '@/lib/db'
import { addDays, businessDate, startOfDay } from '@/lib/time'
import { discounts, products, saleItems, sales, stockMovements, tradingDays } from '@/lib/db/schema'

/** A business date as the UTC instant of local midnight, or null when the value is not a date. */
function dayBounds(value: string | null) {
  const date = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : businessDate()
  // Noon UTC always falls on the same calendar date in the bar's zone.
  const start = startOfDay(new Date(`${date}T12:00:00.000Z`))
  return { date, start, end: addDays(start, 1) }
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission('reports.read')
    const userId = user.id
    const url = new URL(request.url)
    const { date: businessDateValue, start, end } = dayBounds(url.searchParams.get('business_date'))

    const [day] = await db
      .select()
      .from(tradingDays)
      .where(and(eq(tradingDays.userId, userId), eq(tradingDays.businessDate, businessDateValue)))
      .limit(1)
    if (!day) return NextResponse.json({ error: 'No business day found' }, { status: 404 })

    const inDay = [eq(sales.userId, userId), gte(sales.createdAt, start), lt(sales.createdAt, end)]

    const [daySales, [discountTotals], [wastage], [costTotals]] = await Promise.all([
      db
        .select({ total: sales.total, paymentMethod: sales.paymentMethod, status: sales.status, voided: sales.voided })
        .from(sales)
        .where(and(...inDay)),
      db
        .select({
          count: sql<number>`count(*)::int`,
          value: sql<number>`coalesce(sum(${discounts.amount}), 0)::int`,
        })
        .from(discounts)
        .where(and(eq(discounts.userId, userId), gte(discounts.createdAt, start), lt(discounts.createdAt, end))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(stockMovements)
        .where(and(eq(stockMovements.userId, userId), eq(stockMovements.movementType, 'wastage'), gte(stockMovements.createdAt, start), lt(stockMovements.createdAt, end))),
      // Real cost of goods sold: the cost price of each item actually sold, not a fixed ratio.
      db
        .select({
          revenue: sql<number>`coalesce(sum(${saleItems.lineTotal}), 0)::int`,
          cost: sql<number>`coalesce(sum(${saleItems.quantity} * ${products.cost}), 0)::int`,
        })
        .from(saleItems)
        .innerJoin(products, eq(products.id, saleItems.productId))
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(and(
          eq(saleItems.userId, userId),
          eq(sales.userId, userId),
          eq(sales.status, 'completed'),
          eq(sales.voided, false),
          gte(sales.createdAt, start),
          lt(sales.createdAt, end),
        )),
    ])

    // A voided sale keeps its 'completed' status, so the flag decides, not the status alone.
    const paidSales = daySales.filter((sale) => sale.status === 'completed' && !sale.voided)
    const orders = paidSales.length
    const totalSales = paidSales.reduce((sum, sale) => sum + sale.total, 0)
    const byPayment = Object.entries(paidSales.reduce<Record<string, { orders: number; total: number }>>((result, sale) => {
      const row = result[sale.paymentMethod] ?? { orders: 0, total: 0 }
      row.orders += 1
      row.total += sale.total
      result[sale.paymentMethod] = row
      return result
    }, {}))
    const voids = daySales.filter((sale) => sale.voided).length

    const drinkSales = costTotals?.revenue ?? 0
    const drinkCost = costTotals?.cost ?? 0
    const pourCost = drinkSales > 0 ? Math.round((drinkCost / drinkSales) * 10000) / 100 : 0

    return NextResponse.json({
      business_date: businessDateValue,
      orders,
      total_sales: totalSales,
      by_payment: byPayment.map(([method, totals]) => ({ payment_method: method, orders: totals.orders, total: totals.total })),
      voids,
      discounts: discountTotals?.value ?? 0,
      wastage: wastage?.count ?? 0,
      cash_variance: day.cashVariance ?? 0,
      stock_variance_value: day.stockVarianceValue ?? 0,
      pour_cost: pourCost,
    })
  } catch (error) {
    return authErrorResponse(error) ?? databaseErrorResponse(error) ?? NextResponse.json({ error: 'Could not generate report' }, { status: 400 })
  }
}
