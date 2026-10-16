import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { and, eq, gte, lte } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { saleItems, sales } from '@/lib/db/schema'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId()
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const conditions = [eq(sales.userId, userId), eq(sales.status, 'completed')]
    if (from) conditions.push(gte(sales.createdAt, new Date(`${from}T00:00:00.000Z`)))
    if (to) conditions.push(lte(sales.createdAt, new Date(`${to}T23:59:59.999Z`)))
    const saleRows = await db.select().from(sales).where(and(...conditions))
    const saleIds = new Set(saleRows.map((sale) => sale.id))
    const itemRows = saleIds.size ? await db.select().from(saleItems).where(eq(saleItems.userId, userId)) : []
    const items = itemRows.filter((item) => saleIds.has(item.saleId))
    const byPayment = Object.entries(saleRows.reduce<Record<string, number>>((result, sale) => { result[sale.paymentMethod] = (result[sale.paymentMethod] ?? 0) + sale.total; return result }, {})).map(([payment_method, total]) => ({ payment_method, total }))
    const byCategory = Object.values(items.reduce<Record<string, { category: string; quantity: number; total: number }>>((result, item) => { const row = result[item.category] ?? { category: item.category, quantity: 0, total: 0 }; row.quantity += item.quantity; row.total += item.lineTotal; result[item.category] = row; return result }, {}))
    const byProduct = Object.values(items.reduce<Record<string, { product_id: string; product_name: string; category: string; quantity: number; total: number }>>((result, item) => { const row = result[item.productId] ?? { product_id: item.productId, product_name: item.productName, category: item.category, quantity: 0, total: 0 }; row.quantity += item.quantity; row.total += item.lineTotal; result[item.productId] = row; return result }, {}))
    return NextResponse.json({ orders: saleRows.length, total: saleRows.reduce((sum, sale) => sum + sale.total, 0), average_order: saleRows.length ? Math.round(saleRows.reduce((sum, sale) => sum + sale.total, 0) / saleRows.length) : 0, items_sold: items.reduce((sum, item) => sum + item.quantity, 0), by_payment: byPayment, by_category: byCategory, by_product: byProduct })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
