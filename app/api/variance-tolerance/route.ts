import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/db'
import { auditLogs, products, varianceTolerances } from '@/lib/db/schema'

export async function POST(request: Request) {
  try {
    const user = await requirePermission('day.close')
    const body = await request.json()
    const productId = String(body.product_id ?? '')
    const toleranceUnits = Number(body.tolerance_units)

    // A tolerance is what the close will forgive, so it must stay plausibly small.
    if (!productId || !Number.isInteger(toleranceUnits) || toleranceUnits < 0 || toleranceUnits > 10_000) {
      return NextResponse.json({ error: 'Invalid variance tolerance' }, { status: 400 })
    }

    const [product] = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.userId, user.id)))
      .limit(1)
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    await db.transaction(async (tx) => {
      await tx
        .insert(varianceTolerances)
        .values({ userId: user.id, productId: product.id, toleranceUnits })
        .onConflictDoUpdate({
          target: [varianceTolerances.userId, varianceTolerances.productId],
          set: { toleranceUnits },
        })

      // Loosening a tolerance hides stock loss, so the change belongs in the audit trail.
      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'tolerance_change',
        entityType: 'variance_tolerance',
        entityId: product.id,
        recordLabel: product.name,
        metadata: { toleranceUnits },
      }))
    })

    return NextResponse.json({ product_id: product.id, tolerance_units: toleranceUnits }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save tolerance' }, { status: 400 })
  }
}
