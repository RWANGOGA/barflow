import { and, desc, eq, gte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth } from '@/lib/permissions'
import { db } from '@/lib/db'
import { sales, tabs, tradingDays } from '@/lib/db/schema'

type RangeKey = 'today' | 'week' | 'month' | 'two_months' | 'mid_year' | 'all'
const labels: Record<RangeKey, string> = { today: 'This day', week: 'This week', month: 'Month', two_months: 'Two months', mid_year: 'Mid year', all: 'All' }
function range(value: string | null): RangeKey { return value && value in labels ? value as RangeKey : 'week' }
function startFor(value: RangeKey, now: Date): Date | null { if (value === 'all') return null; const days = value === 'today' ? 0 : value === 'week' ? 6 : value === 'month' ? 29 : value === 'two_months' ? 59 : null; const start = days === null ? new Date(now.getFullYear(), 0, 1) : new Date(now); if (days !== null) start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0); return start }
function chart(rows: { createdAt: Date; total: number }[], value: RangeKey, now: Date) { const days = value === 'today' ? 1 : value === 'week' ? 7 : 30; const start = startFor(value, now) ?? now; return Array.from({ length: days }, (_, index) => { const date = new Date(start); date.setDate(date.getDate() + index); return { label: days === 1 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }), total: rows.filter(row => new Date(row.createdAt).toDateString() === date.toDateString()).reduce((sum, row) => sum + row.total, 0) } }) }

export async function GET(request: Request) {
  let user
  try {
    user = await requireAuth()
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load overview' }, { status: 500 })
  }

  const selected = range(new URL(request.url).searchParams.get('range'))
  const now = new Date()
  try {
    const conditions = [eq(sales.userId, user.id)]
    const start = startFor(selected, now)
    if (start) conditions.push(gte(sales.createdAt, start))
    const rows = await db.select().from(sales).where(and(...conditions)).orderBy(desc(sales.createdAt)).limit(5000)
    const openTabs = await db.select().from(tabs).where(and(eq(tabs.userId, user.id), eq(tabs.status, 'open')))
    const days = await db.select().from(tradingDays).where(eq(tradingDays.userId, user.id)).orderBy(desc(tradingDays.openedAt)).limit(1)
    const currentDay = days[0]
    const byPayment = rows.reduce<Record<string, number>>((result, sale) => { result[sale.paymentMethod] = (result[sale.paymentMethod] ?? 0) + sale.total; return result }, {})
    const canReadCash = user.role === 'Admin' || user.role === 'Manager'
    const cashDrawer = {
      expectedCash: canReadCash ? currentDay?.expectedCash ?? currentDay?.openingFloat ?? 0 : 0,
      countedCash: canReadCash ? currentDay?.countedCash ?? null : null,
      cashVariance: canReadCash ? currentDay?.cashVariance ?? null : null,
      dayStatus: currentDay?.status ?? 'no_day',
      dayLocked: currentDay?.locked ?? false,
    }

    return NextResponse.json({ range: selected, rangeLabel: labels[selected], todaySales: rows.reduce((sum, sale) => sum + sale.total, 0), orders: rows.length, openTabs: openTabs.length, openTabsStatus: openTabs.length ? 'Needs attention' : 'All settled', byPayment, week: chart(rows, selected, now), cashDrawer, checklist: { completed: 0, total: 0 } })
  } catch (error) {
    console.error('Overview data unavailable', error)
    return NextResponse.json({ range: selected, rangeLabel: labels[selected], todaySales: 0, orders: 0, openTabs: 0, openTabsStatus: 'Unavailable', byPayment: {}, week: chart([], selected, now), cashDrawer: { expectedCash: 0, countedCash: null, cashVariance: null, dayStatus: 'unavailable', dayLocked: false }, checklist: { completed: 0, total: 0 }, warning: 'Live overview data is temporarily unavailable.' })
  }
}
