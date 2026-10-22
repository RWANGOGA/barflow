import { and, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { approvalErrorResponse, authorizeSensitiveAction } from '@/lib/approvals'
import { auditEvent } from '@/lib/audit'
import { DAY_LOCKED_ERROR, isDayLocked } from '@/lib/day'
import { db } from '@/lib/db'
import { auditLogs, discounts, sales } from '@/lib/db/schema'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sale_id: string }> },
) {
  try {
    // Any till operator may request a discount; a manager has to approve it below.
    const user = await requirePermission('sales.create')
    const { sale_id } = await params
    const body = await request.json()
    const amount = Number(body.amount)
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : ''

    if (!Number.isInteger(amount) || amount <= 0 || reason.length < 3) {
      return NextResponse.json({ error: 'Invalid discount amount or reason' }, { status: 400 })
    }
    // A discount booked after the close would change a locked day's figures.
    if (await isDayLocked(user.id)) return NextResponse.json({ error: DAY_LOCKED_ERROR }, { status: 409 })

    const [sale] = await db
      .select({ id: sales.id, userId: sales.userId, total: sales.total, voided: sales.voided })
      .from(sales)
      .where(and(eq(sales.id, sale_id), eq(sales.userId, user.id)))
      .limit(1)
    if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    if (sale.voided) return NextResponse.json({ error: 'A voided sale cannot be discounted' }, { status: 400 })

    // Discounts accumulate: many small approvals must never total more than the sale.
    const [approved] = await db
      .select({ amount: sql<number>`coalesce(sum(${discounts.amount}), 0)::int` })
      .from(discounts)
      .where(and(eq(discounts.saleId, sale_id), eq(discounts.userId, user.id)))
    const remaining = sale.total - (approved?.amount ?? 0)
    if (remaining <= 0) return NextResponse.json({ error: `Sale ${sale.id.slice(0, 8)} is already fully discounted` }, { status: 400 })
    if (amount > remaining) {
      return NextResponse.json({ error: `Discount exceeds the remaining ${remaining} on this sale` }, { status: 400 })
    }

    // Who actually approved it, and how. This is what the audit trail records.
    const approval = await authorizeSensitiveAction(user, body.pin)

    const outcome = await db.transaction(async (tx) => {
      // Lock the sale so two approvals cannot both spend the same remaining balance.
      const [locked] = await tx
        .select({ total: sales.total })
        .from(sales)
        .where(and(eq(sales.id, sale_id), eq(sales.userId, user.id)))
        .for('update')
        .limit(1)
      if (!locked) return { kind: 'missing' as const }

      const [taken] = await tx
        .select({ amount: sql<number>`coalesce(sum(${discounts.amount}), 0)::int` })
        .from(discounts)
        .where(and(eq(discounts.saleId, sale_id), eq(discounts.userId, user.id)))
      const left = locked.total - (taken?.amount ?? 0)
      if (amount > left) return { kind: 'over' as const, remaining: Math.max(left, 0) }

      const [created] = await tx
        .insert(discounts)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          saleId: sale_id,
          amount,
          reason,
          approvedBy: approval.approverId,
          approvedAt: new Date(),
        })
        .returning()

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'discount',
        entityType: 'sale',
        entityId: sale_id,
        recordLabel: `Sale ${sale_id.slice(0, 8)}`,
        reason,
        approval: approval.method,
        metadata: {
          amount,
          saleTotal: locked.total,
          remainingAfter: left - amount,
          approverId: approval.approverId,
          approverName: approval.approverName,
          approvalMethod: approval.method,
        },
      }))

      return { kind: 'created' as const, discount: created }
    })

    if (outcome.kind === 'missing') return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    if (outcome.kind === 'over') {
      return NextResponse.json({ error: `Discount exceeds the remaining ${outcome.remaining} on this sale` }, { status: 400 })
    }
    return NextResponse.json(outcome.discount, { status: 201 })
  } catch (error) {
    return approvalErrorResponse(error)
      ?? authErrorResponse(error)
      ?? NextResponse.json({ error: 'Could not apply discount' }, { status: 400 })
  }
}
