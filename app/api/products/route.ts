import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { auditLogs, products } from '@/lib/db/schema'

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
      name: String(body.name ?? ''),
      category: String(body.category ?? ''),
      price: Number(body.price),
      stock: Number(body.stock),
      reorder: Number(body.reorder),
      cost: Number(body.cost),
      unit: String(body.unit ?? ''),
      tone: String(body.tone ?? 'slate'),
    }

    if (!product.id || !product.name || !product.category || !product.unit) {
      return NextResponse.json({ error: 'Invalid product' }, { status: 400 })
    }

    const savedProduct = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ userId: products.userId, price: products.price })
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

      if (existing && existing.price !== product.price) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          userId: user.id,
          action: 'price_change',
          recordLabel: product.name,
          approval: 'manager',
          createdAt: new Date(),
        })
      }

      return product
    })

    if (!savedProduct) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    return NextResponse.json(savedProduct)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save product' }, { status: 400 })
  }
}
