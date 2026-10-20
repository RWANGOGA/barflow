import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission, verifyUserPin } from '@/lib/permissions'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/db'
import { auditLogs, discounts, sales } from '@/lib/db/schema'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sale_id: string }> },
) {
  try {
    const user = await requirePermission('sales.void')
    const { sale_id } = await params
    const body = await request.json()
    const amount = Number(body.amount)
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    if (!Number.isInteger(amount) || amount <= 0 || reason.length < 3) {
      return NextResponse.json({ error: 'Invalid discount amount or reason' }, { status: 400 })
    }
    if (user.role !== 'Admin' && !(await verifyUserPin(user.id, body.pin))) {
      return NextResponse.json({ error: 'Manager PIN is invalid' }, { status: 403 })
    }

    const [sale] = await db
      .select({ id: sales.id, userId: sales.userId, total: sales.total })
      .from(sales)
      .where(eq(sales.id, sale_id))
      .limit(1)
    if (!sale || sale.userId !== user.id) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    if (amount > sale.total) return NextResponse.json({ error: 'Discount exceeds sale total' }, { status: 400 })

    const discount = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(discounts)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          saleId: sale_id,
          amount,
          reason,
          approvedBy: user.id,
          approvedAt: new Date(),
        })
        .returning()

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'discount',
        entityType: 'sale',
        entityId: sale_id,
        recordLabel: `Sale ${sale_id.slice(0, 8)}`,
        reason,
        metadata: { amount, saleTotal: sale.total },
      }))

      return created
    })

    return NextResponse.json(discount, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not apply discount' }, { status: 400 })
  }
}
