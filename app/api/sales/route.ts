import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { desc, eq, sql } from 'drizzle-orm'
import { products, saleItems, sales } from '@/lib/db/schema'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    const rows = await db.select().from(sales).where(eq(sales.userId, userId)).orderBy(desc(sales.createdAt)).limit(100)
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const requestedItems = Array.isArray(body.items) ? body.items.slice(0, 100).map((item: any) => ({ productId: String(item.productId), quantity: Number(item.quantity) })) : []
    if (requestedItems.length === 0 || requestedItems.some((item: any) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) return NextResponse.json({ error: 'Invalid sale items' }, { status: 400 })
    const catalog = await db.select().from(products).where(eq(products.userId, userId))
    const items = requestedItems.map((item: any) => { const product = catalog.find(row => row.id === item.productId); if (!product || item.quantity > product.stock) throw new Error('Insufficient stock'); return { productId: product.id, name: product.name, category: product.category, quantity: item.quantity, price: product.price, lineTotal: product.price * item.quantity } })
    const total = items.reduce((sum: number, item: any) => sum + item.lineTotal, 0)
    if (!Number.isInteger(total) || total <= 0) return NextResponse.json({ error: 'Invalid total' }, { status: 400 })
    const sale = { id: crypto.randomUUID(), userId, paymentMethod: String(body.paymentMethod), total, tableLabel: body.tableLabel ? String(body.tableLabel) : null, status: 'completed' }
    await db.transaction(async (tx) => {
      await tx.insert(sales).values(sale)
      await tx.insert(saleItems).values(items.map(item => ({ id: crypto.randomUUID(), userId, saleId: sale.id, productId: item.productId, productName: item.name, category: item.category, unitPrice: item.price, quantity: item.quantity, lineTotal: item.lineTotal })))
      for (const item of items) await tx.update(products).set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() }).where(eq(products.id, item.productId))
    })
    return NextResponse.json(sale)
  } catch {
    return NextResponse.json({ error: 'Could not save sale' }, { status: 400 })
  }
}
