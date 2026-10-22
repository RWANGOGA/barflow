import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/db'
import { auditLogs, settings } from '@/lib/db/schema'
import { BAR_TIME_ZONE, businessDate } from '@/lib/time'

type SettingEntry = { key: string; value: string }

/** Settings the UI relies on are normalised here so two tills cannot store conflicting shapes. */
function normalizeSetting(key: string, raw: string): SettingEntry | { error: string } {
  const submitted = raw.slice(0, 1000)
  if (!submitted.trim()) return { error: 'Invalid setting' }

  if (key === 'currency') {
    const value = submitted.trim().toUpperCase()
    if (!/^[A-Z]{2,5}$/.test(value)) return { error: 'Currency must be a 2–5 letter code such as UGX.' }
    return { key, value }
  }

  if (key === 'bar_name') {
    const value = submitted.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (value.length < 2) return { error: 'Business name must be at least 2 characters.' }
    return { key, value }
  }

  return { key, value: submitted }
}

/** Accepts one `{key,value}` pair or a batch in `{items:{key:value}}` / `{items:[{key,value}]}`. */
function readEntries(body: unknown): SettingEntry[] {
  if (!body || typeof body !== 'object') return []
  const payload = body as { items?: unknown; key?: unknown; value?: unknown }
  const entries: SettingEntry[] = []
  const push = (key: unknown, value: unknown) => {
    if (typeof key === 'string' && key && typeof value === 'string') entries.push({ key: key.slice(0, 100), value })
  }

  if (Array.isArray(payload.items)) {
    for (const row of payload.items) {
      if (row && typeof row === 'object') {
        const item = row as { key?: unknown; value?: unknown }
        push(item.key, item.value)
      }
    }
  } else if (payload.items && typeof payload.items === 'object') {
    for (const [key, value] of Object.entries(payload.items as Record<string, unknown>)) push(key, value)
  } else {
    push(payload.key, payload.value)
  }

  const seen = new Set<string>()
  return entries.filter((entry) => (seen.has(entry.key) ? false : (seen.add(entry.key), true)))
}

export async function GET() {
  try {
    const user = await requirePermission('settings.read')
    const rows = await db.select().from(settings).where(eq(settings.userId, user.id))
    // Device clocks cannot be trusted for a bar's day, so the server states both facts.
    return NextResponse.json({ items: rows, timeZone: BAR_TIME_ZONE, businessDate: businessDate() })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load settings' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('settings.write')
    const entries = readEntries(await request.json())
    if (!entries.length) return NextResponse.json({ error: 'Invalid setting' }, { status: 400 })

    const normalized = entries.map((entry) => normalizeSetting(entry.key, entry.value))
    const invalid = normalized.find((entry): entry is { error: string } => 'error' in entry)
    if (invalid) return NextResponse.json({ error: invalid.error }, { status: 400 })

    // One transaction so a batch either lands completely or leaves the account untouched.
    const saved = await db.transaction(async (tx) => {
      const rows: { key: string; value: string; updatedAt: Date }[] = []
      for (const { key, value } of normalized as SettingEntry[]) {
        const [previous] = await tx
          .select({ value: settings.value })
          .from(settings)
          .where(and(eq(settings.userId, user.id), eq(settings.key, key)))
          .limit(1)

        const [row] = await tx
          .insert(settings)
          .values({ userId: user.id, key, value })
          .onConflictDoUpdate({
            target: [settings.userId, settings.key],
            set: { value, updatedAt: new Date() },
          })
          .returning()

        // Re-saving an unchanged value is not an event; operators care about real edits.
        if (!previous || previous.value !== value) {
          await tx.insert(auditLogs).values(auditEvent(user, {
            action: 'settings_change',
            entityType: 'setting',
            entityId: key,
            recordLabel: key,
            metadata: { previous: previous?.value ?? null, value },
          }))
        }

        rows.push({ key: row.key, value: row.value, updatedAt: row.updatedAt })
      }
      return rows
    })

    return NextResponse.json({ items: saved }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save setting' }, { status: 400 })
  }
}
