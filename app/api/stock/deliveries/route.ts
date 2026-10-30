import { and, desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { isWholeInRange } from '@/lib/limits'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/db'
import { regionalFor } from '@/lib/regional'
import { businessDate } from '@/lib/time'
import { products, stockDeliveries, stockMovements, auditLogs } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requirePermission('inventory.manage')
    const rows = await db
      .select()
      .from(stockDeliveries)
      .where(eq(stockDeliveries.userId, user.id))
      .orderBy(desc(stockDeliveries.deliveryDate))

    return NextResponse.json({ items: rows })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load deliveries' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('inventory.manage')
    const body = await request.json()
    const quantity = Number(body.quantity)
    const costPrice = Number(body.cost_price)
    const productId = String(body.product_id ?? '')
    const supplier = String(body.supplier ?? '').trim().slice(0, 120)
    // A malformed date would reach a `date` column and fail the whole request at the driver.
    const deliveryDate = typeof body.delivery_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.delivery_date)
      ? body.delivery_date
      : businessDate(new Date(), (await regionalFor(user.id)).timeZone)

    if (!isWholeInRange(quantity, undefined, 1) || !isWholeInRange(costPrice)) {
      return NextResponse.json({ error: 'Invalid delivery values' }, { status: 400 })
    }
    const delivery = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.userId, user.id)))
        .limit(1)

      if (!product) return null

      const [createdDelivery] = await tx
        .insert(stockDeliveries)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          supplier,
          productId: product.id,
          quantity,
          costPrice,
          deliveryDate,
        })
        .returning()

      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${quantity}`, cost: costPrice, updatedAt: new Date() })
        .where(and(eq(products.id, product.id), eq(products.userId, user.id)))

      await tx.insert(stockMovements).values({
        id: crypto.randomUUID(),
        userId: user.id,
        productId: product.id,
        quantity,
        movementType: 'delivery',
        reference: createdDelivery.id,
        createdAt: new Date(),
      })

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'delivery',
        entityType: 'stock_delivery',
        entityId: createdDelivery.id,
        reason: supplier || 'Delivery',
        metadata: { quantity, productId, costPrice, deliveryDate },
        recordLabel: product.name,
        approval: 'Recorded',
      }))

      return createdDelivery
    })

    if (!delivery) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    return NextResponse.json(delivery, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save delivery' }, { status: 400 })
  }
}
