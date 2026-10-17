import { and, desc, eq, gte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth } from '@/lib/permissions'
import { db } from '@/lib/db'
import { products, salePayments, sales, tabs, tradingDays } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RangeKey = 'today' | 'week' | 'month' | 'two_months' | 'mid_year' | 'all'
const labels: Record<RangeKey, string> = { today: 'This day', week: 'This week', month: 'Month', two_months: 'Two months', mid_year: 'Mid year', all: 'All' }

function range(value: string | null): RangeKey {
  return value && value in labels ? value as RangeKey : 'week'
}

function startOfLocalDay(value: Date) {
  const start = new Date(value)
  start.setHours(0, 0, 0, 0)
  return start
}

function startFor(value: RangeKey, now: Date): Date | null {
  if (value === 'all') return null
  const start = startOfLocalDay(now)
  if (value === 'today') return start
  if (value === 'week') start.setDate(start.getDate() - 6)
  else if (value === 'month') start.setDate(start.getDate() - 29)
  else if (value === 'two_months') start.setDate(start.getDate() - 59)
  else start.setMonth(0, 1)
  return start
}

function isLiveSale(sale: { status: string; voided: boolean }) {
  return sale.status === 'completed' && !sale.voided
}

function chart(rows: { createdAt: Date; total: number }[], value: RangeKey, now: Date) {
  if (value === 'mid_year' || value === 'all') {
    const months = value === 'all' ? 12 : 6
    return Array.from({ length: months }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1)
      return {
        label: date.toLocaleDateString('en-US', { month: 'short' }),
        total: rows.filter((row) => {
          const created = new Date(row.createdAt)
          return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth()
        }).reduce((sum, row) => sum + row.total, 0),
      }
    })
  }

  const days = value === 'today' ? 1 : value === 'week' ? 7 : value === 'month' ? 14 : 14
  return Array.from({ length: days }, (_, index) => {
    const date = startOfLocalDay(now)
    date.setDate(date.getDate() - (days - 1 - index))
    return {
      label: days === 1 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }),
      total: rows.filter((row) => new Date(row.createdAt).toDateString() === date.toDateString()).reduce((sum, row) => sum + row.total, 0),
    }
  })
}

function json(data: unknown) {
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

export async function GET(request: Request) {
  let user
  try {
    user = await requireAuth()
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load overview' }, { status: 500 })
  }

  const selected = range(new URL(request.url).searchParams.get('range'))
  const now = new Date()
  const todayStart = startOfLocalDay(now)

  try {
    const start = startFor(selected, now)
    const saleFilters = [eq(sales.userId, user.id), eq(sales.status, 'completed'), eq(sales.voided, false)]
    if (start) saleFilters.push(gte(sales.createdAt, start))

    const [rows, todayRows, openTabs, days, catalog, payments] = await Promise.all([
      db.select().from(sales).where(and(...saleFilters)).orderBy(desc(sales.createdAt)).limit(5000),
      db.select().from(sales).where(and(eq(sales.userId, user.id), eq(sales.status, 'completed'), eq(sales.voided, false), gte(sales.createdAt, todayStart))).orderBy(desc(sales.createdAt)),
      db.select().from(tabs).where(and(eq(tabs.userId, user.id), eq(tabs.status, 'open'))),
      db.select().from(tradingDays).where(eq(tradingDays.userId, user.id)).orderBy(desc(tradingDays.openedAt)).limit(1),
      db.select({ stock: products.stock, reorder: products.reorder }).from(products).where(eq(products.userId, user.id)),
      db.select().from(salePayments).where(eq(salePayments.userId, user.id)),
    ])

    const liveRows = rows.filter(isLiveSale)
    const liveToday = todayRows.filter(isLiveSale)
    const todayIds = new Set(liveToday.map((sale) => sale.id))
    const byPayment = liveRows.reduce<Record<string, number>>((result, sale) => {
      result[sale.paymentMethod] = (result[sale.paymentMethod] ?? 0) + sale.total
      return result
    }, {})
    const cashToday = payments
      .filter((payment) => todayIds.has(payment.saleId) && payment.method === 'cash')
      .reduce((sum, payment) => sum + payment.amount, 0)
    const cashFallback = liveToday
      .filter((sale) => sale.paymentMethod === 'cash')
      .reduce((sum, sale) => sum + sale.total, 0)
    const currentDay = days[0]
    const openingFloat = currentDay?.openingFloat ?? 0
    const expectedCash = openingFloat + (cashToday || cashFallback)
    const countedCash = currentDay?.countedCash ?? null
    const cashVariance = countedCash == null ? null : countedCash - expectedCash
    const canReadCash = user.role === 'Admin' || user.role === 'Manager'
    const lowStock = catalog.filter((item) => item.stock <= item.reorder).length
    const checklistItems = [
      { label: 'Review low stock', done: lowStock === 0 },
      { label: 'Settle open tabs', done: openTabs.length === 0 },
      { label: 'Count till at close', done: Boolean(currentDay && currentDay.status === 'closed') },
      { label: 'Trading day open', done: currentDay?.status === 'open' },
    ]

    return json({
      range: selected,
      rangeLabel: labels[selected],
      todaySales: liveToday.reduce((sum, sale) => sum + sale.total, 0),
      rangeSales: liveRows.reduce((sum, sale) => sum + sale.total, 0),
      orders: liveToday.length,
      rangeOrders: liveRows.length,
      openTabs: openTabs.length,
      openTabsStatus: openTabs.length ? 'Needs attention' : 'All settled',
      byPayment,
      week: chart(liveRows, selected, now),
      recent: liveToday.slice(0, 6).map((sale) => ({
        id: sale.id,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        tableLabel: sale.tableLabel,
        createdAt: sale.createdAt,
      })),
      lowStock,
      cashDrawer: {
        expectedCash: canReadCash ? expectedCash : 0,
        countedCash: canReadCash ? countedCash : null,
        cashVariance: canReadCash ? cashVariance : null,
        dayStatus: currentDay?.status ?? 'no_day',
        dayLocked: currentDay?.locked ?? false,
      },
      checklist: {
        completed: checklistItems.filter((item) => item.done).length,
        total: checklistItems.length,
        items: checklistItems,
      },
    })
  } catch (error) {
    console.error('Overview data unavailable', error)
    return json({
      range: selected,
      rangeLabel: labels[selected],
      todaySales: 0,
      rangeSales: 0,
      orders: 0,
      rangeOrders: 0,
      openTabs: 0,
      openTabsStatus: 'Unavailable',
      byPayment: {},
      week: chart([], selected, now),
      recent: [],
      lowStock: 0,
      cashDrawer: { expectedCash: 0, countedCash: null, cashVariance: null, dayStatus: 'unavailable', dayLocked: false },
      checklist: { completed: 0, total: 0, items: [] },
      warning: 'Live overview data is temporarily unavailable.',
    })
  }
}
