/**
 * Business-time helpers. Vercel runs in UTC, but a bar's trading day follows local
 * midnight, so every day boundary is computed against an explicit zone instead of
 * the host clock. Override with BAR_TIMEZONE when the bar is not in Kampala.
 */
export const BAR_TIME_ZONE = process.env.BAR_TIMEZONE?.trim() || 'Africa/Kampala'

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

export function zonedParts(value: Date): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BAR_TIME_ZONE,
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
function offsetMinutes(value: Date) {
  const parts = zonedParts(value)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return Math.round((asUtc - value.getTime()) / 60000)
}

/** The UTC instant at which the bar's local day containing `value` starts. */
export function startOfDay(value: Date): Date {
  const parts = zonedParts(value)
  const midnight = Date.UTC(parts.year, parts.month - 1, parts.day)
  // Two passes settle the offset even if the first guess lands on the other side of a DST change.
  let instant = midnight - offsetMinutes(new Date(midnight)) * 60000
  instant = midnight - offsetMinutes(new Date(instant)) * 60000
  return new Date(instant)
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
}

/** The bar's calendar date as YYYY-MM-DD, used for trading-day records. */
export function businessDate(value = new Date()): string {
  const parts = zonedParts(value)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function formatBarTime(value: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: BAR_TIME_ZONE, ...options }).format(value)
}
