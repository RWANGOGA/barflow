import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { and, desc, eq, gte } from 'drizzle-orm'
import { sales, tabs, tradingDays } from '@/lib/db/schema'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rows = await db.select().from(sales).where(eq(sales.userId, userId)).orderBy(desc(sales.createdAt)).limit(500)
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const weekStart = new Date(start)
  weekStart.setDate(start.getDate() - 6)
  const today = rows.filter((sale) => new Date(sale.createdAt) >= start)
  const week = rows.filter((sale) => new Date(sale.createdAt) >= weekStart)

  // Payment breakdown for the week (chart subtitle accuracy)
  const byPayment = week.reduce<Record<string, number>>((acc, sale) => {
    acc[sale.paymentMethod] = (acc[sale.paymentMethod] ?? 0) + sale.total
    return acc
  }, {})

  // Open tabs count (real, not hardcoded)
  const openTabs = await db.select().from(tabs).where(and(eq(tabs.userId, userId), eq(tabs.status, 'open')))

  // Cash drawer from the most recent day record
  const day = await db.select().from(tradingDays).where(eq(tradingDays.userId, userId)).orderBy(desc(tradingDays.openedAt)).limit(1)
  const currentDay = day[0]
  const expectedCash = currentDay?.expectedCash ?? currentDay?.openingFloat ?? 0
  const countedCash = currentDay?.countedCash ?? null
  const cashVariance = currentDay?.cashVariance ?? null
  const dayLocked = currentDay?.locked ?? false
  const dayStatus = currentDay?.status ?? 'no_day'

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + index)
    return {
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      total: week.filter((sale) => new Date(sale.createdAt).toDateString() === date.toDateString()).reduce((sum, sale) => sum + sale.total, 0)
    }
  })
  return NextResponse.json({
    todaySales: today.reduce((sum, sale) => sum + sale.total, 0),
    orders: today.length,
    openTabs: openTabs.length,
    openTabsStatus: openTabs.length > 0 ? 'Needs attention' : 'All settled',
    byPayment,
    week: days,
    cashDrawer: {
      expectedCash,
      countedCash,
      cashVariance,
      dayStatus,
      dayLocked,
    },
    checklist: { completed: 0, total: 0 },
  })
}
