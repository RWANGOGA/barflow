import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { products, stockTransfers } from '@/lib/db/schema'

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
    const productId = String(body.product_id ?? '')
    const quantity = Number(body.quantity)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.userId, user.id)))
      .limit(1)

    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const [transfer] = await db
      .insert(stockTransfers)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        productId: product.id,
        quantity,
        fromLocation: String(body.from_location ?? ''),
        toLocation: String(body.to_location ?? ''),
        reason: body.reason == null ? null : String(body.reason),
      })
      .returning()

    return NextResponse.json(transfer, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save transfer' }, { status: 400 })
  }
}
