import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { tradingDays, tabs } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requireAuth()
    const today = new Date().toISOString().slice(0, 10)
    const existing = await db
      .select()
      .from(tradingDays)
      .where(and(eq(tradingDays.userId, user.id), eq(tradingDays.businessDate, today)))
      .limit(1)

    if (!existing[0]) return NextResponse.json(null)
    if (user.role === 'Admin' || user.role === 'Manager') return NextResponse.json(existing[0])

    const { id, userId, businessDate, status, openedAt, closedAt, locked } = existing[0]
    return NextResponse.json({ id, userId, businessDate, status, openedAt, closedAt, locked })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('day.close')
    const userId = user.id
    const body = await request.json()
    const action = String(body.action)
    const today = new Date().toISOString().slice(0, 10)
    const existing = await db
      .select()
      .from(tradingDays)
      .where(and(eq(tradingDays.userId, userId), eq(tradingDays.businessDate, today)))
      .limit(1)

    if (action === 'open') {
      const day = existing[0] ?? {
        id: crypto.randomUUID(),
        userId,
        businessDate: today,
        status: 'open',
        openingFloat: Number(body.openingFloat) || 0,
      }
      if (existing[0]) await db.update(tradingDays).set({ status: 'open' }).where(and(eq(tradingDays.id, day.id), eq(tradingDays.userId, userId)))
      else await db.insert(tradingDays).values(day)
      return NextResponse.json({ ...day, status: 'open' })
    }

    if (action === 'close' && existing[0]) {
      const openTabs = await db.select().from(tabs).where(and(eq(tabs.userId, userId), eq(tabs.status, 'open'))).limit(1)
      if (openTabs.length > 0) return NextResponse.json({ error: 'Open tabs must be settled before closing.' }, { status: 400 })
      await db.update(tradingDays).set({ status: 'closed', countedCash: Number(body.countedCash) || 0, closedAt: new Date(), varianceAccepted: true }).where(and(eq(tradingDays.id, existing[0].id), eq(tradingDays.userId, userId)))
      return NextResponse.json({ ...existing[0], status: 'closed' })
    }

    return NextResponse.json({ error: 'Invalid day action' }, { status: 400 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save trading day' }, { status: 400 })
  }
}
