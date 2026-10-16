import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tradingDays, sales, saleItems, stockMovements, discounts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId()
    const url = new URL(request.url)
    const business_date = url.searchParams.get('business_date') ?? new Date().toISOString().slice(0, 10)
    const day = await db.select().from(tradingDays).where(and(eq(tradingDays.userId, userId), eq(tradingDays.businessDate, business_date))).limit(1)
    if (!day[0]) return NextResponse.json({ error: 'No business day found' }, { status: 404 })
    const d = day[0]
    const s = await db.select().from(sales).where(and(eq(sales.userId, userId), eq(sales.status, 'completed')))
    const todaySales = s.filter((x: any) => String(x.createdAt).slice(0, 10) === business_date)
    const orders = todaySales.length
    const totalSales = todaySales.reduce((sum: number, x: any) => sum + x.total, 0)
    const byPayment = Object.values(todaySales.reduce<Record<string, { orders: number; total: number }>>((r, x: any) => { const k = x.paymentMethod; r[k] = r[k] || { orders: 0, total: 0 }; r[k].orders += 1; r[k].total += x.total; return r }, {}))
    const voids = todaySales.filter((x: any) => x.voided).length
    const discounts = await db.select().from(saleItems).where(and(eq(saleItems.userId, userId)))
    const wastage = await db.select().from(stockMovements).where(and(eq(stockMovements.userId, userId), eq(stockMovements.movementType, 'wastage')))
    const drinkSales = todaySales.reduce((sum: number, x: any) => sum + x.total, 0)
    const drinkCost = todaySales.reduce((sum: number, x: any) => sum + (x.total * 0.65), 0)
    const pourCost = drinkSales > 0 ? drinkCost / drinkSales * 100 : 0
    return NextResponse.json({
      business_date,
      orders,
      total_sales: totalSales,
      by_payment: Object.entries(byPayment).map(([k, v]) => ({ payment_method: k, orders: v.orders, total: v.total })),
      voids,
      discounts: 0,
      wastage: wastage.length,
      cash_variance: d.cashVariance ?? 0,
      stock_variance_value: d.stockVarianceValue ?? 0,
      pour_cost: Math.round(pourCost * 100) / 100,
    })
  } catch {
    return NextResponse.json({ error: 'Could not generate report' }, { status: 400 })
  }
}
