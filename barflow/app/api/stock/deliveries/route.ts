import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products, stockDeliveries, stockMovements } from '@/lib/db/schema'
import { desc, eq, sql } from 'drizzle-orm'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    const rows = await db.select().from(stockDeliveries).where(eq(stockDeliveries.userId, userId)).orderBy(desc(stockDeliveries.deliveryDate))
    return NextResponse.json({ items: rows })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const deliveryDate = String(body.delivery_date)
    const delivery = await db.insert(stockDeliveries).values({
      id: crypto.randomUUID(),
      userId,
      supplier: body.supplier,
      productId: body.product_id,
      quantity: Number(body.quantity),
      costPrice: Number(body.cost_price),
      deliveryDate,
    }).returning()
    await db.transaction(async (tx) => {
      await tx.update(products).set({ stock: sql`${products.stock} + ${Number(body.quantity)}`, cost: Number(body.cost_price), updatedAt: new Date() }).where(eq(products.id, body.product_id))
      await tx.insert(stockMovements).values({
        id: crypto.randomUUID(),
        userId,
        productId: body.product_id,
        quantity: Number(body.quantity),
        movementType: 'delivery',
        reference: delivery[0].id,
        createdAt: new Date(),
      })
    })
    return NextResponse.json(delivery[0], { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not save delivery' }, { status: 400 })
  }
}
