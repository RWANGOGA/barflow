import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { products, stockCounts, tradingDays, auditLogs } from '@/lib/db/schema'

export async function POST(request: Request) {
  try {
    const user = await requirePermission('inventory.manage')
    const body = await request.json()
    const productId = String(body.product_id ?? '')
    const countedQuantity = Number(body.counted_quantity)

    if (!productId || !Number.isInteger(countedQuantity) || countedQuantity < 0) {
      return NextResponse.json({ error: 'Invalid stock count' }, { status: 400 })
    }

    const [day] = await db
      .select({ id: tradingDays.id })
      .from(tradingDays)
      .where(and(eq(tradingDays.userId, user.id), eq(tradingDays.status, 'open')))
      .limit(1)
    if (!day) return NextResponse.json({ error: 'No open business day' }, { status: 400 })

    const [product] = await db
      .select({ id: products.id, stock: products.stock, price: products.price })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.userId, user.id)))
      .limit(1)
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const varianceUnits = countedQuantity - product.stock
    const [count] = await db
      .insert(stockCounts)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        dayId: day.id,
        productId: product.id,
        countedQuantity,
        expectedQuantity: product.stock,
        varianceUnits,
        varianceValue: varianceUnits * product.price,
      })
      .returning()

    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: user.id,
      action: 'count',
      entityType: 'stock_count',
      entityId: count.id,
      reason: 'Stock count',
      metadata: { productId, countedQuantity, expectedQuantity: product.stock, varianceUnits },
      recordLabel: productId,
      approval: 'Recorded',
    })

    return NextResponse.json(count, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save stock count' }, { status: 400 })
  }
}
