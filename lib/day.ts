import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tradingDays } from '@/lib/db/schema'

export const DAY_LOCKED_ERROR = 'The trading day is closed. Open a new day before recording sales or tabs.'

/**
 * A closed trading day locks the till. The dashboard hides the sale buttons, but the
 * API must reject writes too, otherwise a stale tab can still post sales all night.
 */
export async function isDayLocked(userId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const [day] = await db
    .select({ status: tradingDays.status, locked: tradingDays.locked })
    .from(tradingDays)
    .where(and(eq(tradingDays.userId, userId), eq(tradingDays.businessDate, today)))
    .limit(1)

  return Boolean(day?.locked || day?.status === 'closed')
}
