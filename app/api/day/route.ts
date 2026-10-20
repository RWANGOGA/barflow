import { and, eq, gte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth, requirePermission } from '@/lib/permissions'
import { auditEvent } from '@/lib/audit'
import { databaseErrorResponse } from '@/lib/db-errors'
import { db } from '@/lib/db'
import { auditLogs, salePayments, sales, tabs, tradingDays } from '@/lib/db/schema'

async function expectedCashFor(userId: string, openingFloat: number) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todaySales = await db
    .select()
    .from(sales)
    .where(and(eq(sales.userId, userId), eq(sales.status, 'completed'), eq(sales.voided, false), gte(sales.createdAt, todayStart)))
  const saleIds = new Set(todaySales.map((sale) => sale.id))
  const payments = saleIds.size
    ? await db.select().from(salePayments).where(eq(salePayments.userId, userId))
    : []
  const cashFromPayments = payments
    .filter((payment) => saleIds.has(payment.saleId) && payment.method === 'cash')
    .reduce((sum, payment) => sum + payment.amount, 0)
  const cashFallback = todaySales
    .filter((sale) => sale.paymentMethod === 'cash')
    .reduce((sum, sale) => sum + sale.total, 0)
  return openingFloat + (cashFromPayments || cashFallback)
}

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
    return authErrorResponse(error) ?? databaseErrorResponse(error) ?? NextResponse.json({ error: 'Could not load the trading day' }, { status: 500 })
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
      if (existing[0]) await db.update(tradingDays).set({ status: 'open', locked: false, closedAt: null }).where(and(eq(tradingDays.id, day.id), eq(tradingDays.userId, userId)))
      else await db.insert(tradingDays).values(day)
      return NextResponse.json({ ...day, status: 'open' })
    }

    if (action === 'close' && existing[0]) {
      const openTabs = await db.select().from(tabs).where(and(eq(tabs.userId, userId), eq(tabs.status, 'open'))).limit(1)
      if (openTabs.length > 0) return NextResponse.json({ error: 'Open tabs must be settled before closing.' }, { status: 400 })
      const countedCash = Number(body.countedCash) || 0
      if (!Number.isInteger(countedCash) || countedCash < 0) {
        return NextResponse.json({ error: 'Counted cash must be a whole amount of 0 or more.' }, { status: 400 })
      }
      const expectedCash = await expectedCashFor(userId, existing[0].openingFloat ?? 0)
      const cashVariance = countedCash - expectedCash
      const reason = typeof body.varianceReason === 'string' ? body.varianceReason.trim() : ''
      // A cash difference must be explained before the day can be locked.
      if (cashVariance !== 0 && reason.length < 3) {
        return NextResponse.json({ error: 'A variance reason is required when counted cash does not match expected cash.' }, { status: 400 })
      }
      const closedAt = new Date()
      await db.update(tradingDays).set({
        status: 'closed',
        countedCash,
        expectedCash,
        cashVariance,
        varianceReason: reason || null,
        varianceAccepted: true,
        locked: true,
        closedAt,
      }).where(and(eq(tradingDays.id, existing[0].id), eq(tradingDays.userId, userId)))

      await db.insert(auditLogs).values(auditEvent(user, {
        action: 'day_close',
        entityType: 'day',
        entityId: existing[0].id,
        reason: reason || null,
        recordLabel: existing[0].businessDate,
        metadata: { countedCash, expectedCash, cashVariance },
      }))

      return NextResponse.json({ ...existing[0], status: 'closed', countedCash, expectedCash, cashVariance, varianceReason: reason || null, varianceAccepted: true, locked: true, closedAt })
    }

    return NextResponse.json({ error: 'Invalid day action' }, { status: 400 })
  } catch (error) {
    return authErrorResponse(error) ?? databaseErrorResponse(error) ?? NextResponse.json({ error: 'Could not save trading day' }, { status: 400 })
  }
}
