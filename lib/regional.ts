import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { DEFAULT_TIME_ZONE, parseRegionalSettings, type RegionalSettings } from '@/lib/locale'

/**
 * The effective regional settings for a workspace.
 *
 * Callers pass the tenant key (`user.id` from `getCurrentUser`), because every settings row
 * is owned by the workspace owner. Missing rows fall back to the documented defaults so a
 * brand-new bar works before anyone opens the settings page.
 */
export async function regionalFor(workspaceId: string): Promise<RegionalSettings> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(eq(settings.userId, workspaceId))
  return parseRegionalSettings(rows)
}

/** The zone trading days and report buckets are measured in. */
export async function timeZoneFor(workspaceId: string): Promise<string> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.userId, workspaceId), eq(settings.key, 'time_zone')))
    .limit(1)
  return normalizeZone(row?.value)
}

function normalizeZone(value: string | undefined): string {
  if (!value) return process.env.BAR_TIMEZONE?.trim() || DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(0)
    return value
  } catch {
    return process.env.BAR_TIMEZONE?.trim() || DEFAULT_TIME_ZONE
  }
}
