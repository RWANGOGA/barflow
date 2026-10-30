/**
 * Business-time helpers. Vercel runs in UTC, but a bar's trading day follows local
 * midnight, so every day boundary is computed against an explicit zone instead of
 * the host clock. The zone comes from the workspace setting; BAR_TIMEZONE is the fallback.
 */
export const BAR_TIME_ZONE = process.env.BAR_TIMEZONE?.trim() || 'Africa/Kampala'

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

export function zonedParts(value: Date, timeZone = BAR_TIME_ZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute'), second: read('second') }
}

/** Minutes the zone is ahead of UTC at the given instant. */
function offsetMinutes(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return Math.round((asUtc - value.getTime()) / 60000)
}

/** The UTC instant at which the bar's local day containing `value` starts. */
export function startOfDay(value: Date, timeZone = BAR_TIME_ZONE): Date {
  const parts = zonedParts(value, timeZone)
  const midnight = Date.UTC(parts.year, parts.month - 1, parts.day)
  // Two passes settle the offset even if the first guess lands on the other side of a DST change.
  let instant = midnight - offsetMinutes(new Date(midnight), timeZone) * 60000
  instant = midnight - offsetMinutes(new Date(instant), timeZone) * 60000
  return new Date(instant)
}

/**
 * Add calendar days in the bar's zone. A plain 24-hour addition drifts by an hour across a
 * DST change, which would move report bucket boundaries and the cash-drawer window.
 */
export function addDays(value: Date, days: number, timeZone = BAR_TIME_ZONE): Date {
  const naive = new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
  const before = offsetMinutes(value, timeZone)
  const after = offsetMinutes(naive, timeZone)
  return new Date(naive.getTime() + (before - after) * 60000)
}

/** The bar's calendar date as YYYY-MM-DD, used for trading-day records. */
export function businessDate(value = new Date(), timeZone = BAR_TIME_ZONE): string {
  const parts = zonedParts(value, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function formatBarTime(value: Date, options: Intl.DateTimeFormatOptions, timeZone = BAR_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(value)
}

/** ISO date for a `date` column, offset from a YYYY-MM-DD string. */
export function shiftIsoDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00.000Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}
