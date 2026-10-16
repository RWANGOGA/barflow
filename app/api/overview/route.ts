import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { and, desc, eq, gte } from 'drizzle-orm'
import { sales, tabs, tradingDays } from '@/lib/db/schema'

type RangeKey = 'today' | 'week' | 'month' | 'two_months' | 'mid_year' | 'all'

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'This day',
  week: 'This week',
  month: 'Month',
  two_months: 'Two months',
  mid_year: 'Mid year',
  all: 'All',
}

function rangeStart(range: RangeKey, now: Date): Date | null {
  if (range === 'today') {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d
  }
  if (range === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d
  }
  if (range === 'month') {
    const d = new Date(now); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d
  }
  if (range === 'two_months') {
    const d = new Date(now); d.setDate(d.getDate() - 59); d.setHours(0, 0, 0, 0); return d
  }
  if (range === 'mid_year') {
    return new Date(now.getFullYear(), 0, 1)
  }
  return null
}

function buildChart(rows: any[], range: RangeKey, now: Date) {
  const isMonthly = range === 'two_months' || range === 'mid_year' || range === 'all'
  if (isMonthly) {
    const monthCount = range === 'all' ? 12 : range === 'mid_year' ? 6 : 2
    const monthMap = new Map<string, number>()
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      monthMap.set(d.toLocaleDateString('en-US', { month: 'short' }), 0)
    }
    for (const sale of rows) {
      const label = new Date(sale.createdAt).toLocaleDateString('en-US', { month: 'short' })
      monthMap.set(label, (monthMap.get(label) ?? 0) + sale.total)
    }
    return Array.from(monthMap.entries()).reverse().map(([label, total]) => ({ label, total }))
  }
  const days = range === 'today' ? 1 : range === 'week' ? 7 : 30
  const start = new Date(now); start.setDate(start.getDate() - (days - 1)); start.setHours(0, 0, 0, 0)
  const result = []
  for (let i = 0; i < days; i++) {
    const date = new Date(start); date.setDate(start.getDate() + i)
    const label = days === 1 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' })
    const total = rows.filter(s => new Date(s.createdAt).toDateString() === date.toDateString()).reduce((sum, s) => sum + s.total, 0)
    result.push({ label, total })
  }
  return result
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { searchParams } = new URL(request.url)
  const range = (searchParams.get('range') ?? 'week') as RangeKey

  const now = new Date()
  const startDate = rangeStart(range, now)

  const whereConditions = [eq(sales.userId, userId)]
  if (startDate) whereConditions.push(gte(sales.createdAt, startDate))

  const rows = await db.select().from(sales).where(and(...whereConditions)).orderBy(desc(sales.createdAt)).limit(5000)

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayRows = rows.filter(s => new Date(s.createdAt) >= todayStart)

  // Payment breakdown for the selected range
  const byPayment = rows.reduce<Record<string, number>>((acc, sale) => {
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

  const chart = buildChart(rows, range, now)

  return NextResponse.json({
    range,
    rangeLabel: RANGE_LABELS[range],
    todaySales: rows.reduce((sum, sale) => sum + sale.total, 0),
    orders: rows.length,
    todayOnlySales: todayRows.reduce((sum, sale) => sum + sale.total, 0),
    todayOnlyOrders: todayRows.length,
    openTabs: openTabs.length,
    openTabsStatus: openTabs.length > 0 ? 'Needs attention' : 'All settled',
    byPayment,
    week: chart,
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
