import { and, desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { products, stockMovements, stockTransfers, auditLogs } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requirePermission('inventory.manage')
    const rows = await db
      .select()
      .from(stockTransfers)
      .where(eq(stockTransfers.userId, user.id))
      .orderBy(desc(stockTransfers.createdAt))

    return NextResponse.json({ items: rows })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load transfers' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('inventory.manage')
    const body = await request.json()
    const quantity = Number(body.quantity)
    const productId = String(body.product_id ?? '')
    const fromLocation = String(body.from_location ?? '')
    const toLocation = String(body.to_location ?? '')

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid transfer values' }, { status: 400 })
    }

    const transfer = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, name: products.name, stock: products.stock })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.userId, user.id)))
        .limit(1)

      if (!product) return null

      if (fromLocation === 'Main' && product.stock < quantity) {
        return null
      }

      const [createdTransfer] = await tx
        .insert(stockTransfers)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          productId: product.id,
          quantity,
          fromLocation,
          toLocation,
          reason: body.reason ? String(body.reason) : '',
        })
        .returning()

      if (fromLocation === 'Main') {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, product.id), eq(products.userId, user.id)))
      } else if (toLocation === 'Main') {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, product.id), eq(products.userId, user.id)))
      }

      await tx.insert(stockMovements).values({
        id: crypto.randomUUID(),
        userId: user.id,
        productId: product.id,
        quantity: fromLocation === 'Main' ? -quantity : quantity,
        movementType: 'transfer',
        reference: createdTransfer.id,
      })

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'transfer',
        entityType: 'stock_transfer',
        entityId: createdTransfer.id,
        reason: body.reason ? String(body.reason) : '',
        metadata: { fromLocation, toLocation, quantity, productId },
        recordLabel: product.name,
        approval: 'Recorded',
      })

      return createdTransfer
    })

    if (!transfer) return NextResponse.json({ error: 'Transfer failed' }, { status: 400 })
    return NextResponse.json(transfer, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save transfer' }, { status: 400 })
  }
}
