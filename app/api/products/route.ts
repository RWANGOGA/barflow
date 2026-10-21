import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth, requirePermission } from '@/lib/permissions'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/db'
import { auditLogs, products, stockMovements } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requireAuth()
    if (user.role === 'Admin' || user.role === 'Manager') {
      const rows = await db.select().from(products).where(eq(products.userId, user.id))
      return NextResponse.json(rows)
    }

    // Cashier and Storekeeper need the catalogue but not menu cost data.
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        category: products.category,
        price: products.price,
        stock: products.stock,
        reorder: products.reorder,
        unit: products.unit,
        tone: products.tone,
      })
      .from(products)
      .where(eq(products.userId, user.id))
    return NextResponse.json(rows)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load products' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('menu.manage')
    const body = await request.json()
    const product = {
      id: String(body.id ?? ''),
      userId: user.id,
      name: String(body.name ?? '').trim().slice(0, 80),
      category: String(body.category ?? '').trim().slice(0, 40),
      price: Number(body.price),
      stock: Number(body.stock),
      reorder: Number(body.reorder),
      cost: Number(body.cost),
      unit: String(body.unit ?? '').trim().slice(0, 20),
      tone: String(body.tone ?? 'slate').trim().slice(0, 20) || 'slate',
    }

    if (!product.id || !product.name || !product.category || !product.unit) {
      return NextResponse.json({ error: 'Invalid product' }, { status: 400 })
    }
    const amounts = [product.price, product.stock, product.reorder, product.cost]
    // Integer columns are 32-bit; an out-of-range value would fail the insert instead of the check.
    const inRange = (amount: number) => Number.isInteger(amount) && amount >= 0 && amount <= 100_000_000
    if (!amounts.every(inRange) || product.price <= 0) {
      return NextResponse.json({ error: 'Price, stock, reorder level and cost must be whole numbers within range' }, { status: 400 })
    }

    const savedProduct = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ userId: products.userId, price: products.price, stock: products.stock })
        .from(products)
        .where(eq(products.id, product.id))
        .limit(1)

      // Do not let an upsert reassign a product owned by a different account.
      if (existing && existing.userId !== user.id) return null

      if (existing) {
        await tx
          .update(products)
          .set({ ...product, updatedAt: new Date() })
          .where(and(eq(products.id, product.id), eq(products.userId, user.id)))
      } else {
        await tx.insert(products).values(product)
      }

      // Editing the opening stock on the menu page is still a stock movement and must be traceable.
      const stockDelta = existing ? product.stock - existing.stock : product.stock
      if (stockDelta !== 0) {
        await tx.insert(stockMovements).values({
          id: crypto.randomUUID(),
          userId: user.id,
          productId: product.id,
          quantity: stockDelta,
          movementType: 'menu_adjustment',
          reference: product.name,
        })
      }

      if (existing && existing.price !== product.price) {
        await tx.insert(auditLogs).values(auditEvent(user, {
          action: 'price_change',
          entityType: 'product',
          entityId: product.id,
          recordLabel: product.name,
          metadata: { from: existing.price, to: product.price },
        }))
      }

      return product
    })

    if (!savedProduct) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    return NextResponse.json(savedProduct)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save product' }, { status: 400 })
  }
}
