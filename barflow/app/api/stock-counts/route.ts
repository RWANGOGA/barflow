import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { stockCounts, tradingDays, products } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const { day_id, product_id, counted_quantity } = body
    const day = await db.select().from(tradingDays).where(and(eq(tradingDays.userId, userId), eq(tradingDays.status, 'open'))).limit(1)
    if (!day[0]) return NextResponse.json({ error: 'No open business day' }, { status: 400 })
    const product = await db.select().from(products).where(and(eq(products.id, product_id), eq(products.userId, userId))).limit(1)
    if (!product[0]) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    const expected = product[0].stock
    const varianceUnits = Number(counted_quantity) - expected
    const varianceValue = varianceUnits * product[0].price
    const count = await db.insert(stockCounts).values({
      id: crypto.randomUUID(),
      userId,
      dayId: day[0].id,
      productId: product_id,
      countedQuantity: Number(counted_quantity),
      expectedQuantity: expected,
      varianceUnits,
      varianceValue,
    }).returning()
    return NextResponse.json(count[0], { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not save stock count' }, { status: 400 })
  }
}
