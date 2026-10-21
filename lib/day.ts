import { and, desc, eq, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tradingDays } from '@/lib/db/schema'
import { businessDate } from '@/lib/time'

export const DAY_LOCKED_ERROR = 'The trading day is closed. Open a new day before recording sales or tabs.'

/**
 * The day the bar is actually trading. A late close can happen after local midnight,
 * so an open day wins over today's date; otherwise today's row is the current one.
 */
export async function currentTradingDay(userId: string) {
  const [day] = await db
    .select()
    .from(tradingDays)
    .where(and(eq(tradingDays.userId, userId), or(eq(tradingDays.status, 'open'), eq(tradingDays.businessDate, businessDate()))))
    // Open first, then the newest: a legacy extra open day must never lose to a closed row.
    .orderBy(desc(sql`${tradingDays.status} = 'open'`), desc(tradingDays.openedAt))
    .limit(1)
  return day ?? null
}

/**
 * A closed trading day locks the till. The dashboard hides the sale buttons, but the
 * API must reject writes too, otherwise a stale tab can still post sales all night.
 *
 * The check follows the bar's timezone, never the host's: on a UTC server the calendar
 * date is still "yesterday" for the first hours of a Kampala trading day, and comparing
 * against yesterday's closed row would block every sale.
 */
export async function isDayLocked(userId: string) {
  const day = await currentTradingDay(userId)
  return Boolean(day?.locked || day?.status === 'closed')
}
