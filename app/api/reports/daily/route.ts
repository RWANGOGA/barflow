import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { tradingDays, sales, saleItems, stockMovements } from '@/lib/db/schema'

export async function GET(request: Request) {
  try {
    const user = await requirePermission('reports.read')
    const userId = user.id
    const url = new URL(request.url)
    const business_date = url.searchParams.get('business_date') ?? new Date().toISOString().slice(0, 10)
    const day = await db.select().from(tradingDays).where(and(eq(tradingDays.userId, userId), eq(tradingDays.businessDate, business_date))).limit(1)
    if (!day[0]) return NextResponse.json({ error: 'No business day found' }, { status: 404 })
    const d = day[0]
    const s = await db.select().from(sales).where(and(eq(sales.userId, userId), eq(sales.status, 'completed')))
    const todaySales = s.filter((x: any) => String(x.createdAt).slice(0, 10) === business_date)
    const orders = todaySales.length
    const totalSales = todaySales.reduce((sum: number, x: any) => sum + x.total, 0)
    const byPayment = Object.values(todaySales.reduce<Record<string, { orders: number; total: number }>>((result, sale: any) => {
      const method = sale.paymentMethod
      result[method] = result[method] || { orders: 0, total: 0 }
      result[method].orders += 1
      result[method].total += sale.total
      return result
    }, {}))
    const voids = todaySales.filter((sale: any) => sale.voided).length
    const wastage = await db.select().from(stockMovements).where(and(eq(stockMovements.userId, userId), eq(stockMovements.movementType, 'wastage')))
    const drinkSales = todaySales.reduce((sum: number, sale: any) => sum + sale.total, 0)
    const drinkCost = todaySales.reduce((sum: number, sale: any) => sum + sale.total * 0.65, 0)
    const pourCost = drinkSales > 0 ? drinkCost / drinkSales * 100 : 0

    return NextResponse.json({
      business_date,
      orders,
      total_sales: totalSales,
      by_payment: Object.entries(byPayment).map(([method, totals]: [string, any]) => ({ payment_method: method, orders: totals.orders, total: totals.total })),
      voids,
      discounts: 0,
      wastage: wastage.length,
      cash_variance: d.cashVariance ?? 0,
      stock_variance_value: d.stockVarianceValue ?? 0,
      pour_cost: Math.round(pourCost * 100) / 100,
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not generate report' }, { status: 400 })
  }
}
