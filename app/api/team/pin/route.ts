import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/db'
import { hashPin, verifyPin } from '@/lib/pin'
import { auditLogs, userPins } from '@/lib/db/schema'

/** Whether the signed-in manager has an approval PIN on file. The digest is never returned. */
export async function GET() {
  try {
    const user = await requirePermission('team.manage')
    const [row] = await db
      .select({ pinHash: userPins.pinHash })
      .from(userPins)
      .where(eq(userPins.userId, user.actorId))
      .limit(1)

    return NextResponse.json({ hasPin: Boolean(row) })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load approval PIN' }, { status: 500 })
  }
}

/**
 * Set, replace, or remove the signed-in user's approval PIN.
 * Replacing or removing requires the current PIN so a walk-up session cannot lock the owner out.
 */
export async function POST(request: Request) {
  try {
    const user = await requirePermission('team.manage')
    const body = await request.json().catch(() => ({}))
    const remove = body?.remove === true

    const [existing] = await db
      .select({ pinHash: userPins.pinHash })
      .from(userPins)
      .where(eq(userPins.userId, user.actorId))
      .limit(1)

    const currentPin = typeof body?.currentPin === 'string' ? body.currentPin.trim() : ''
    if (existing) {
      if (!currentPin) {
        return NextResponse.json({ error: 'Enter your current PIN to change or remove it' }, { status: 400 })
      }
      if (!verifyPin(currentPin, existing.pinHash)) {
        return NextResponse.json({ error: 'That current PIN is not correct' }, { status: 403 })
      }
    }

    if (remove) {
      if (!existing) return NextResponse.json({ hasPin: false })
      await db.transaction(async (tx) => {
        await tx.delete(userPins).where(eq(userPins.userId, user.actorId))
        await tx.insert(auditLogs).values(auditEvent(user, {
          action: 'pin_change',
          entityType: 'approval_pin',
          entityId: user.actorId,
          recordLabel: 'Approval PIN removed',
          metadata: { removed: true },
        }))
      })
      return NextResponse.json({ hasPin: false })
    }

    const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: 'A PIN must be 4 to 8 digits' }, { status: 400 })
    }
    if (existing && currentPin === pin) {
      return NextResponse.json({ error: 'Choose a PIN that differs from the current one' }, { status: 400 })
    }

    const pinHash = hashPin(pin)
    await db.transaction(async (tx) => {
      await tx
        .insert(userPins)
        .values({ userId: user.actorId, pinHash })
        .onConflictDoUpdate({ target: userPins.userId, set: { pinHash } })

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'pin_change',
        entityType: 'approval_pin',
        entityId: user.actorId,
        recordLabel: existing ? 'Approval PIN replaced' : 'Approval PIN created',
        metadata: { replaced: Boolean(existing) },
      }))
    })

    return NextResponse.json({ hasPin: true })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save approval PIN' }, { status: 400 })
  }
}
