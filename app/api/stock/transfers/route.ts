import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { auditEvent } from '@/lib/audit'
import { databaseErrorResponse } from '@/lib/db-errors'
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
    const fromLocation = String(body.from_location ?? '').trim().slice(0, 40)
    const toLocation = String(body.to_location ?? '').trim().slice(0, 40)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid transfer values' }, { status: 400 })
    }
    if (!fromLocation || !toLocation) {
      return NextResponse.json({ error: 'Choose both a source and a destination' }, { status: 400 })
    }
    if (fromLocation === toLocation) {
      return NextResponse.json({ error: 'Choose two different locations' }, { status: 400 })
    }

    const outcome = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, name: products.name, stock: products.stock })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.userId, user.id)))
        .limit(1)

      if (!product) return { kind: 'missing' as const }

      // Only Main is backed by bar_product.stock, so only a transfer touching Main changes the
      // inventory or belongs in the movement ledger. Store-to-Bar moves are recorded elsewhere.
      const touchesMain = fromLocation === 'Main' || toLocation === 'Main'

      // Reserve the stock before writing anything, so a short transfer leaves no trace.
      if (fromLocation === 'Main') {
        // The read above can lose a race with a sale; this guarded write cannot.
        const [reserved] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, product.id), eq(products.userId, user.id), gte(products.stock, quantity)))
          .returning({ id: products.id })
        if (!reserved) {
          const [latest] = await tx
            .select({ stock: products.stock })
            .from(products)
            .where(and(eq(products.id, product.id), eq(products.userId, user.id)))
            .limit(1)
          return { kind: 'insufficient' as const, available: latest?.stock ?? 0 }
        }
      } else if (toLocation === 'Main') {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, product.id), eq(products.userId, user.id)))
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
          reason: body.reason ? String(body.reason).trim().slice(0, 200) : '',
        })
        .returning()

      if (touchesMain) {
        await tx.insert(stockMovements).values({
          id: crypto.randomUUID(),
          userId: user.id,
          productId: product.id,
          quantity: fromLocation === 'Main' ? -quantity : quantity,
          movementType: 'transfer',
          reference: createdTransfer.id,
        })
      }

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'transfer',
        entityType: 'stock_transfer',
        entityId: createdTransfer.id,
        reason: body.reason ? String(body.reason).trim().slice(0, 200) : '',
        metadata: { fromLocation, toLocation, quantity, productId },
        recordLabel: product.name,
        approval: 'Recorded',
      }))

      return { kind: 'created' as const, transfer: createdTransfer }
    })

    if (outcome.kind === 'missing') {
      return NextResponse.json({ error: 'Product was not found' }, { status: 404 })
    }
    if (outcome.kind === 'insufficient') {
      return NextResponse.json(
        { error: `Only ${outcome.available} on hand in Main` },
        { status: 409 },
      )
    }
    return NextResponse.json(outcome.transfer, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? databaseErrorResponse(error) ?? NextResponse.json({ error: 'Could not save transfer' }, { status: 400 })
  }
}
