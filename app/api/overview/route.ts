import { and, desc, eq, gte, lt, lte, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth } from '@/lib/permissions'
import { databaseErrorResponse } from '@/lib/db-errors'
import { db } from '@/lib/db'
import { addDays, businessDate, formatBarTime, startOfDay, zonedParts } from '@/lib/time'
import { discounts, products, saleItems, salePayments, sales, tabs, tradingDays } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 30

type RangeKey = 'today' | 'week' | 'month' | 'two_months' | 'mid_year' | 'all'
type SeriesPoint = { label: string; tooltip: string; total: number; orders: number }

const labels: Record<RangeKey, string> = {
  today: 'This day',
  week: 'This week',
  month: 'Month',
  two_months: 'Two months',
  mid_year: 'Mid year',
  all: 'All',
}

function range(value: string | null): RangeKey {
  return value && value in labels ? value as RangeKey : 'week'
}

function startFor(value: RangeKey, now: Date): Date | null {
  if (value === 'all') return null
  const start = startOfDay(now)
  if (value === 'today') return start
  if (value === 'week') return addDays(start, -6)
  if (value === 'month') return addDays(start, -29)
  if (value === 'two_months') return addDays(start, -59)
  // Noon UTC always falls on the same calendar date in the bar's zone, so this lands on 1 January.
  return startOfDay(new Date(Date.UTC(zonedParts(now).year, 0, 1, 12)))
}

/** The equally long window immediately before the selected range, for deltas. */
function previousWindow(value: RangeKey, start: Date | null, now: Date) {
  if (!start) return null
  const today = startOfDay(now)
  const span = Math.max(today.getTime() - start.getTime(), 24 * 60 * 60 * 1000)
  return { from: new Date(start.getTime() - span), to: start }
}

const sum = (rows: { total: number }[]) => rows.reduce((total, row) => total + row.total, 0)
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Build the chart from real rows. Granularity follows the range so a bar always shows
 * something meaningful: hours today, days this week/month, weeks for two months, months beyond.
 */
function buildSeries(value: RangeKey, rows: { total: number; createdAt: Date }[], now: Date): SeriesPoint[] {
  // Zone parts are computed once per sale rather than once per bucket.
  const prepared = rows.map((row) => ({ ...row, parts: zonedParts(row.createdAt) }))
  const bucket = (label: string, tooltip: string, matches: (row: (typeof prepared)[number]) => boolean): SeriesPoint => {
    const selected = prepared.filter(matches)
    return { label, tooltip, total: sum(selected), orders: selected.length }
  }

  if (value === 'mid_year' || value === 'all') {
    const months = value === 'all' ? 12 : 6
    const current = zonedParts(now)
    return Array.from({ length: months }, (_, index) => {
      const ordinal = current.year * 12 + (current.month - 1) - (months - 1 - index)
      const year = Math.floor(ordinal / 12)
      const month = ordinal % 12
      return bucket(
        monthNames[month],
        `${monthNames[month]} ${year}`,
        (row) => row.parts.year === year && row.parts.month === month + 1,
      )
    })
  }

  if (value === 'today') {
    const today = zonedParts(now)
    return Array.from({ length: 24 }, (_, hour) => bucket(
      `${String(hour).padStart(2, '0')}:00`,
      `${String(hour).padStart(2, '0')}:00–${String(hour).padStart(2, '0')}:59`,
      (row) => row.parts.year === today.year && row.parts.month === today.month && row.parts.day === today.day && row.parts.hour === hour,
    ))
  }

  // Tomorrow at local midnight, so the last daily bucket always ends with today.
  const anchor = addDays(startOfDay(now), 1)

  if (value === 'two_months') {
    const weeks = 9
    return Array.from({ length: weeks }, (_, index) => {
      const end = addDays(anchor, -(weeks - 1 - index) * 7)
      const start = addDays(end, -7)
      return bucket(
        formatBarTime(start, { day: 'numeric', month: 'short' }),
        `${formatBarTime(start, { day: 'numeric', month: 'short' })} – ${formatBarTime(new Date(end.getTime() - 1), { day: 'numeric', month: 'short' })}`,
        (row) => row.createdAt >= start && row.createdAt < end,
      )
    })
  }

  const days = value === 'week' ? 7 : 30
  return Array.from({ length: days }, (_, index) => {
    const start = addDays(anchor, -(days - index))
    const end = addDays(start, 1)
    return bucket(
      value === 'week' ? formatBarTime(start, { weekday: 'short' }) : formatBarTime(start, { day: 'numeric' }),
      formatBarTime(start, { weekday: 'short', day: 'numeric', month: 'short' }),
      (row) => row.createdAt >= start && row.createdAt < end,
    )
  })
}

function percentChange(current: number, previous: number | null) {
  if (previous === null) return null
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
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
  const todayStart = startOfDay(now)
  const yesterdayStart = addDays(todayStart, -1)
  const start = startFor(selected, now)
  const previous = previousWindow(selected, start, now)

  // Only completed, non-voided sales count toward revenue. The filter lives in SQL so a
  // large history never has to travel to the function.
  const live = [eq(sales.userId, user.id), eq(sales.status, 'completed'), eq(sales.voided, false)]
  const inRange = start ? [...live, gte(sales.createdAt, start)] : live

  try {
    // The trading day owns the till: a day opened before midnight still includes its late sales.
    const [tradingDay] = await db
      .select()
      .from(tradingDays)
      .where(and(eq(tradingDays.userId, user.id), or(eq(tradingDays.status, 'open'), eq(tradingDays.businessDate, businessDate(now)))))
      .orderBy(desc(tradingDays.openedAt))
      .limit(1)
    const cashStart = tradingDay?.openedAt ?? todayStart

    const [
      rangeRows,
      [rangeTotals],
      [todayTotals],
      [sessionTotals],
      [previousTotals],
      [yesterdayTotals],
      paymentRows,
      productRows,
      [itemTotals],
      [discountTotals],
      [voidTotals],
      openTabRows,
      lowStockRows,
      recentRows,
      [cashPayments],
      [cashFallback],
    ] = await Promise.all([
      db
        .select({ total: sales.total, createdAt: sales.createdAt, paymentMethod: sales.paymentMethod })
        .from(sales)
        .where(and(...inRange))
        // Newest first so a very long history is truncated at the old end, never the live end.
        .orderBy(desc(sales.createdAt))
        .limit(20000),
      db
        .select({
          revenue: sql<number>`coalesce(sum(${sales.total}), 0)::int`,
          orders: sql<number>`count(*)::int`,
        })
        .from(sales)
        .where(and(...inRange)),
      db
        .select({
          revenue: sql<number>`coalesce(sum(${sales.total}), 0)::int`,
          orders: sql<number>`count(*)::int`,
        })
        .from(sales)
        .where(and(...live, gte(sales.createdAt, todayStart))),
      // What the open (or just-closed) trading session has taken, across midnight included.
      tradingDay
        ? db
            .select({
              revenue: sql<number>`coalesce(sum(${sales.total}), 0)::int`,
              orders: sql<number>`count(*)::int`,
            })
            .from(sales)
            .where(and(
              ...live,
              gte(sales.createdAt, tradingDay.openedAt),
              ...(tradingDay.status === 'closed' && tradingDay.closedAt ? [lt(sales.createdAt, tradingDay.closedAt)] : []),
            ))
        : Promise.resolve([null]),
      previous
        ? db
            .select({
              revenue: sql<number>`coalesce(sum(${sales.total}), 0)::int`,
              orders: sql<number>`count(*)::int`,
            })
            .from(sales)
            .where(and(...live, gte(sales.createdAt, previous.from), lt(sales.createdAt, previous.to)))
        : Promise.resolve([null]),
      db
        .select({ revenue: sql<number>`coalesce(sum(${sales.total}), 0)::int` })
        .from(sales)
        .where(and(...live, gte(sales.createdAt, yesterdayStart), lt(sales.createdAt, todayStart))),
      db
        .select({
          method: salePayments.method,
          amount: sql<number>`coalesce(sum(${salePayments.amount}), 0)::int`,
        })
        .from(salePayments)
        .innerJoin(sales, eq(sales.id, salePayments.saleId))
        .where(and(...inRange))
        .groupBy(salePayments.method),
      db
        .select({
          name: saleItems.productName,
          category: saleItems.category,
          quantity: sql<number>`sum(${saleItems.quantity})::int`,
          revenue: sql<number>`sum(${saleItems.lineTotal})::int`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(and(...inRange))
        .groupBy(saleItems.productName, saleItems.category)
        .orderBy(desc(sql`sum(${saleItems.lineTotal})`))
        .limit(8),
      db
        .select({ units: sql<number>`coalesce(sum(${saleItems.quantity}), 0)::int` })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(and(...inRange)),
      db
        .select({
          count: sql<number>`count(*)::int`,
          value: sql<number>`coalesce(sum(${discounts.amount}), 0)::int`,
        })
        .from(discounts)
        .where(and(eq(discounts.userId, user.id), ...(start ? [gte(discounts.createdAt, start)] : []))),
      db
        .select({
          count: sql<number>`count(*)::int`,
          value: sql<number>`coalesce(sum(${sales.total}), 0)::int`,
        })
        .from(sales)
        .where(and(eq(sales.userId, user.id), eq(sales.voided, true), ...(start ? [gte(sales.createdAt, start)] : []))),
      db
        .select({ total: tabs.total })
        .from(tabs)
        .where(and(eq(tabs.userId, user.id), eq(tabs.status, 'open'))),
      db
        .select({ id: products.id, name: products.name, stock: products.stock, reorder: products.reorder })
        .from(products)
        .where(and(eq(products.userId, user.id), lte(products.stock, products.reorder)))
        .orderBy(products.stock)
        .limit(50),
      db
        .select({
          id: sales.id,
          total: sales.total,
          paymentMethod: sales.paymentMethod,
          tableLabel: sales.tableLabel,
          createdAt: sales.createdAt,
        })
        .from(sales)
        .where(and(...live))
        .orderBy(desc(sales.createdAt))
        .limit(6),
      db
        .select({ amount: sql<number>`coalesce(sum(${salePayments.amount}), 0)::int` })
        .from(salePayments)
        .innerJoin(sales, eq(sales.id, salePayments.saleId))
        .where(and(...live, eq(salePayments.method, 'cash'), gte(sales.createdAt, cashStart))),
      db
        .select({ amount: sql<number>`coalesce(sum(${sales.total}), 0)::int` })
        .from(sales)
        .where(and(...live, eq(sales.paymentMethod, 'cash'), gte(sales.createdAt, cashStart))),
    ])

    const revenue = rangeTotals?.revenue ?? 0
    const orders = rangeTotals?.orders ?? 0
    const todayRevenue = todayTotals?.revenue ?? 0
    const todayOrders = todayTotals?.orders ?? 0

    // Split payments are the source of truth; legacy sales without payment rows fall back
    // to the method recorded on the sale itself.
    const paymentTotal = paymentRows.reduce((total, row) => total + row.amount, 0)
    const mix = paymentTotal > 0
      ? paymentRows.map((row) => ({ method: row.method, amount: row.amount }))
      : Object.entries(
          rangeRows.reduce<Record<string, number>>((result, row) => {
            result[row.paymentMethod] = (result[row.paymentMethod] ?? 0) + row.total
            return result
          }, {}),
        ).map(([method, amount]) => ({ method, amount }))
    const byPayment = mix
      .map((row) => ({ ...row, share: revenue > 0 ? Math.round((row.amount / revenue) * 1000) / 10 : 0 }))
      .sort((left, right) => right.amount - left.amount)

    const currentDay = tradingDay
    const openingFloat = currentDay?.openingFloat ?? 0
    const dayClosed = currentDay?.status === 'closed'
    // A closed day keeps the figure frozen at close; an open day is estimated live.
    const expectedCash = dayClosed && currentDay?.expectedCash != null
      ? currentDay.expectedCash
      : openingFloat + (cashPayments?.amount || cashFallback?.amount || 0)
    const countedCash = currentDay?.countedCash ?? null
    const canReadCash = user.role === 'Admin' || user.role === 'Manager'
    const openTabsValue = openTabRows.reduce((total, tab) => total + tab.total, 0)
    const checklistItems = [
      { label: 'Review low stock', done: lowStockRows.length === 0 },
      { label: 'Settle open tabs', done: openTabRows.length === 0 },
      { label: 'Count till at close', done: Boolean(currentDay && currentDay.status === 'closed') },
      { label: 'Trading day open', done: currentDay?.status === 'open' },
    ]

    return json({
      range: selected,
      rangeLabel: labels[selected],
      generatedAt: now.toISOString(),
      today: {
        revenue: todayRevenue,
        orders: todayOrders,
        averageOrder: todayOrders ? Math.round(todayRevenue / todayOrders) : 0,
      },
      // A bar can trade past midnight: the session figure keeps the latest sales visible.
      session: tradingDay
        ? {
            status: tradingDay.status,
            revenue: sessionTotals?.revenue ?? 0,
            orders: sessionTotals?.orders ?? 0,
            openedAt: tradingDay.openedAt.toISOString(),
          }
        : null,
      totals: {
        revenue,
        orders,
        averageOrder: orders ? Math.round(revenue / orders) : 0,
        itemsSold: itemTotals?.units ?? 0,
        discounts: discountTotals?.count ?? 0,
        discountsValue: discountTotals?.value ?? 0,
        voidedOrders: voidTotals?.count ?? 0,
        voidedValue: voidTotals?.value ?? 0,
      },
      previous: previousTotals ? { revenue: previousTotals.revenue, orders: previousTotals.orders } : null,
      delta: {
        revenue: percentChange(revenue, previousTotals?.revenue ?? null),
        orders: percentChange(orders, previousTotals?.orders ?? null),
        todayRevenue: percentChange(todayRevenue, yesterdayTotals?.revenue ?? null),
      },
      openTabs: openTabRows.length,
      openTabsValue,
      openTabsStatus: openTabRows.length ? 'Needs attention' : 'All settled',
      byPayment,
      series: buildSeries(selected, rangeRows, now),
      topProducts: productRows,
      lowStock: { count: lowStockRows.length, items: lowStockRows.slice(0, 6) },
      cashDrawer: {
        openingFloat: canReadCash ? openingFloat : 0,
        expectedCash: canReadCash ? expectedCash : 0,
        // A count only means something once the day is closed; a reopened day has none.
        countedCash: canReadCash && dayClosed ? countedCash : null,
        cashVariance: canReadCash && dayClosed && countedCash != null ? countedCash - expectedCash : null,
        dayStatus: currentDay?.status ?? 'no_day',
        dayLocked: currentDay?.locked ?? false,
      },
      recent: recentRows,
      checklist: {
        completed: checklistItems.filter((item) => item.done).length,
        total: checklistItems.length,
        items: checklistItems,
      },
    })
  } catch (error) {
    console.error('Overview data unavailable', error)
    // Never answer with a zeroed payload: an empty bar and a broken query must not look alike.
    return (
      databaseErrorResponse(error) ??
      NextResponse.json({ error: 'Could not load live overview data. Try again.' }, { status: 500 })
    )
  }
}
