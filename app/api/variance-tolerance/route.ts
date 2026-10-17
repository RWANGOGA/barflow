import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { products, varianceTolerances } from '@/lib/db/schema'

export async function POST(request: Request) {
  try {
    const user = await requirePermission('day.close')
    const body = await request.json()
    const productId = String(body.product_id ?? '')
    const toleranceUnits = Number(body.tolerance_units)

    if (!productId || !Number.isInteger(toleranceUnits) || toleranceUnits < 0) {
      return NextResponse.json({ error: 'Invalid variance tolerance' }, { status: 400 })
    }

    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.userId, user.id)))
      .limit(1)
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    await db
      .insert(varianceTolerances)
      .values({ userId: user.id, productId: product.id, toleranceUnits })
      .onConflictDoUpdate({
        target: [varianceTolerances.userId, varianceTolerances.productId],
        set: { toleranceUnits },
      })

    return NextResponse.json({ product_id: product.id, tolerance_units: toleranceUnits }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save tolerance' }, { status: 400 })
  }
}
