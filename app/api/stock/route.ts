import { and, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/db'
import { products, stockMovements, auditLogs } from '@/lib/db/schema'

export async function POST(request: Request) {
  try {
    const user = await requirePermission('inventory.manage')
    const body = await request.json()
    const quantity = Number(body.quantity)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const productId = String(body.productId ?? '')
    const result = await db.transaction(async (tx) => {
      const [updatedProduct] = await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${quantity}`, updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.userId, user.id)))
        .returning({ id: products.id, name: products.name, stock: products.stock })

      if (!updatedProduct) return null

      const movementId = crypto.randomUUID()
      const reference = String(body.reference ?? 'Delivery')
      await tx.insert(stockMovements).values({
        id: movementId,
        userId: user.id,
        productId: updatedProduct.id,
        quantity,
        movementType: 'delivery',
        reference,
      })

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'delivery',
        entityType: 'stock_delivery',
        entityId: movementId,
        reason: reference,
        metadata: { quantity, productId },
        recordLabel: updatedProduct.name,
        approval: 'Recorded',
      }))

      return updatedProduct
    })

    if (!result) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    return NextResponse.json({ ok: true, stock: result.stock })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not record stock' }, { status: 400 })
  }
}
