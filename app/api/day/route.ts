import { and, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth, requirePermission } from '@/lib/permissions'
import { auditEvent } from '@/lib/audit'
import { databaseErrorResponse } from '@/lib/db-errors'
import { db } from '@/lib/db'
import { businessDate } from '@/lib/time'
import { auditLogs, salePayments, sales, tabs, tradingDays } from '@/lib/db/schema'

async function expectedCashFor(userId: string, openingFloat: number, openedAt: Date) {
  // Cash belongs to the trading session, so a day opened before midnight keeps its late sales.
  const liveSales = and(eq(sales.userId, userId), eq(sales.status, 'completed'), eq(sales.voided, false), gte(sales.createdAt, openedAt))
  // Aggregated in SQL so a long payment history never has to travel to the function.
  const [[payments], [fallback]] = await Promise.all([
    db
      .select({ amount: sql<number>`coalesce(sum(${salePayments.amount}), 0)::int` })
      .from(salePayments)
      .innerJoin(sales, eq(sales.id, salePayments.saleId))
      .where(and(eq(salePayments.userId, userId), eq(salePayments.method, 'cash'), liveSales)),
    db
      .select({ amount: sql<number>`coalesce(sum(${sales.total}), 0)::int` })
      .from(sales)
      .where(and(eq(sales.paymentMethod, 'cash'), liveSales)),
  ])
  // Split payments are authoritative; legacy sales without payment rows fall back to the sale method.
  return openingFloat + (payments?.amount || fallback?.amount || 0)
}

/**
 * The day the bar is actually trading. A late close can happen after local midnight,
 * so the open day wins over today's date; a day closed today stays visible for its summary.
 */
async function currentDay(userId: string) {
  const [open] = await db
    .select()
    .from(tradingDays)
    .where(and(eq(tradingDays.userId, userId), eq(tradingDays.status, 'open')))
    .limit(1)
  if (open) return open

  const [today] = await db
    .select()
    .from(tradingDays)
    .where(and(eq(tradingDays.userId, userId), eq(tradingDays.businessDate, businessDate())))
    .limit(1)
  return today ?? null
}

export async function GET() {
  try {
    const user = await requireAuth()
    const current = await currentDay(user.id)

    if (!current) return NextResponse.json(null)
    // Counts and variances belong to a closed day; never report leftovers from a previous close.
    const record = current.status === 'closed'
      ? current
      : { ...current, countedCash: null, expectedCash: null, cashVariance: null, varianceReason: null, varianceAccepted: false }
    if (user.role === 'Admin' || user.role === 'Manager') return NextResponse.json(record)

    const { id, userId, businessDate: date, status, openedAt, closedAt, locked } = record
    return NextResponse.json({ id, userId, businessDate: date, status, openedAt, closedAt, locked })
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
    const current = await currentDay(userId)

    if (action === 'open') {
      if (current) {
        // Reopening starts a fresh till session; the previous count and variance are history.
        const reopened = { status: 'open', locked: false, closedAt: null, countedCash: null, expectedCash: null, cashVariance: null, varianceReason: null, varianceAccepted: false }
        await db.update(tradingDays).set(reopened).where(and(eq(tradingDays.id, current.id), eq(tradingDays.userId, userId)))
        return NextResponse.json({ ...current, ...reopened })
      }
      // The one-open-day index means a bar can never hold two open days at once.
      const day = {
        id: crypto.randomUUID(),
        userId,
        businessDate: businessDate(),
        status: 'open',
        openingFloat: Number(body.openingFloat) || 0,
      }
      await db.insert(tradingDays).values(day)
      return NextResponse.json({ ...day, locked: false })
    }

    if (action === 'close' && current) {
      const openTabs = await db.select().from(tabs).where(and(eq(tabs.userId, userId), eq(tabs.status, 'open'))).limit(1)
      if (openTabs.length > 0) return NextResponse.json({ error: 'Open tabs must be settled before closing.' }, { status: 400 })
      const countedCash = Number(body.countedCash) || 0
      if (!Number.isInteger(countedCash) || countedCash < 0) {
        return NextResponse.json({ error: 'Counted cash must be a whole amount of 0 or more.' }, { status: 400 })
      }
      const expectedCash = await expectedCashFor(userId, current.openingFloat ?? 0, current.openedAt)
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
      }).where(and(eq(tradingDays.id, current.id), eq(tradingDays.userId, userId)))

      await db.insert(auditLogs).values(auditEvent(user, {
        action: 'day_close',
        entityType: 'day',
        entityId: current.id,
        reason: reason || null,
        recordLabel: current.businessDate,
        metadata: { countedCash, expectedCash, cashVariance },
      }))

      return NextResponse.json({ ...current, status: 'closed', countedCash, expectedCash, cashVariance, varianceReason: reason || null, varianceAccepted: true, locked: true, closedAt })
    }

    return NextResponse.json({ error: 'Invalid day action' }, { status: 400 })
  } catch (error) {
    return authErrorResponse(error) ?? databaseErrorResponse(error) ?? NextResponse.json({ error: 'Could not save trading day' }, { status: 400 })
  }
}
