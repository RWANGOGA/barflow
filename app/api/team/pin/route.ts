import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { userPins } from '@/lib/db/schema'

const hashPin = (pin: string) => createHash('sha256').update(pin).digest('hex')

/** Whether the signed-in manager has an approval PIN on file. The digest is never returned. */
export async function GET() {
  try {
    const user = await requirePermission('team.manage')
    const [row] = await db
      .select({ pinHash: userPins.pinHash })
      .from(userPins)
      .where(eq(userPins.userId, user.id))
      .limit(1)

    return NextResponse.json({ hasPin: Boolean(row) })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load approval PIN' }, { status: 500 })
  }
}

/** Store or replace the signed-in user's approval PIN. */
export async function POST(request: Request) {
  try {
    const user = await requirePermission('team.manage')
    const body = await request.json()
    const pin = typeof body.pin === 'string' ? body.pin.trim() : ''
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: 'A PIN must be 4 to 8 digits' }, { status: 400 })
    }

    const pinHash = hashPin(pin)
    await db
      .insert(userPins)
      .values({ userId: user.id, pinHash })
      .onConflictDoUpdate({ target: userPins.userId, set: { pinHash } })

    return NextResponse.json({ hasPin: true })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save approval PIN' }, { status: 400 })
  }
}
