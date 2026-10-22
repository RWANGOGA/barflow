import { and, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { databaseErrorResponse } from '@/lib/db-errors'
import { db } from '@/lib/db'
import { addDays, BAR_TIME_ZONE, businessDate, startOfDay } from '@/lib/time'
import { auditLogs, user as users } from '@/lib/db/schema'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 300
const EXPORT_LIMIT = 20000

/** Parse a business date as the UTC instant of local midnight, matching the bar's timezone. */
function boundary(value: string | null, exclusiveNextDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  // Noon UTC always falls on the same calendar date in the bar's zone.
  const noon = new Date(`${value}T12:00:00.000Z`)
  if (Number.isNaN(noon.getTime())) return null
  const start = startOfDay(noon)
  return exclusiveNextDay ? addDays(start, 1) : start
}

/** Preset windows are computed on the server so a browser in another timezone cannot shift them. */
function periodStart(period: string | null): Date | null {
  const today = startOfDay(new Date())
  if (period === 'today') return today
  if (period === '7d') return addDays(today, -6)
  if (period === '30d') return addDays(today, -29)
  return null
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

type EventRow = {
  id: string
  action: string
  entityType: string | null
  entityId: string | null
  recordLabel: string
  reason: string | null
  approval: string
  actorRole: string | null
  metadata: Record<string, unknown>
  createdAt: Date
  userName: string | null
  userRole: string | null
}

/**
 * Audit history is written by the routes that perform each change, so this endpoint is
 * read-only by design. A client-writable audit endpoint would let an operator forge or
 * erase the record it is meant to prove.
 */
export async function GET(request: Request) {
  try {
    const user = await requirePermission('audit.read')
    const url = new URL(request.url)

    const action = url.searchParams.get('action')
    const entityType = url.searchParams.get('entityType')
    const period = url.searchParams.get('period')
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')
    const search = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
    const format = url.searchParams.get('format')
    const customFrom = boundary(fromParam)
    const customTo = boundary(toParam, true)
    const from = customFrom ?? periodStart(period)
    const to = customTo
    const defaultLimit = format === 'csv' ? EXPORT_LIMIT : DEFAULT_LIMIT
    const requestedLimit = Number(url.searchParams.get('limit') ?? defaultLimit)
    const requestedOffset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), format === 'csv' ? EXPORT_LIMIT : MAX_LIMIT)
      : defaultLimit
    const offset = Number.isFinite(requestedOffset) ? Math.max(Math.trunc(requestedOffset), 0) : 0

    // The period scopes summaries and facet counts; the remaining filters narrow the rows.
    const periodFilters: SQL[] = [eq(auditLogs.userId, user.id)]
    if (from) periodFilters.push(gte(auditLogs.createdAt, from))
    if (to) periodFilters.push(lt(auditLogs.createdAt, to))
    const periodWhere = and(...periodFilters)

    const filters = [...periodFilters]
    if (action && action !== 'all') filters.push(eq(auditLogs.action, action.slice(0, 120)))
    if (entityType) filters.push(eq(auditLogs.entityType, entityType.slice(0, 60)))
    if (search) {
      const pattern = `%${escapeLike(search)}%`
      const searchFilter = or(
        ilike(auditLogs.recordLabel, pattern),
        ilike(auditLogs.reason, pattern),
        ilike(auditLogs.entityId, pattern),
        sql`${auditLogs.metadata}::text ILIKE ${pattern}`,
        ilike(users.name, pattern),
      )
      if (searchFilter) filters.push(searchFilter)
    }
    const where = and(...filters)

    const eventsQuery = db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        recordLabel: auditLogs.recordLabel,
        reason: auditLogs.reason,
        approval: auditLogs.approval,
        actorRole: auditLogs.actorRole,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        userName: users.name,
        userRole: users.role,
      })
      .from(auditLogs)
      // A left join keeps the event visible even if the account row is gone. Older rows have
      // no actor_id, so fall back to the tenant owner that was stored in user_id.
      .leftJoin(users, sql`${users.id} = coalesce(${auditLogs.actorId}, ${auditLogs.userId})`)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    if (format === 'csv') {
      const rows = (await eventsQuery) as EventRow[]
      const header = ['time', 'action', 'entityType', 'entityId', 'record', 'reason', 'user', 'role', 'approval', 'metadata', 'id']
      const lines = [header.join(',')]
      for (const row of rows) {
        lines.push([
          row.createdAt.toISOString(),
          row.action,
          row.entityType,
          row.entityId,
          row.recordLabel,
          row.reason,
          row.userName,
          row.actorRole ?? row.userRole,
          row.approval,
          row.metadata,
          row.id,
        ].map(csvCell).join(','))
      }
      const rangeTag = fromParam && toParam ? `${fromParam}_to_${toParam}` : fromParam ? `from_${fromParam}` : toParam ? `to_${toParam}` : period ?? 'all-time'
      return new NextResponse(`\uFEFF${lines.join('\r\n')}\r\n`, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="barflow-audit-${rangeTag}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const [events, [totals], actionFacets, entityFacets, [summary]] = await Promise.all([
      eventsQuery,
      db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).leftJoin(users, sql`${users.id} = coalesce(${auditLogs.actorId}, ${auditLogs.userId})`).where(where),
      db
        .select({ action: auditLogs.action, count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(periodWhere)
        .groupBy(auditLogs.action),
      db
        .select({ entityType: auditLogs.entityType, count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(periodWhere)
        .groupBy(auditLogs.entityType),
      db
        .select({
          total: sql<number>`count(*)::int`,
          voids: sql<number>`count(*) filter (where ${auditLogs.action} = 'void')::int`,
          discounts: sql<number>`count(*) filter (where ${auditLogs.action} = 'discount')::int`,
          discountAmount: sql<number>`coalesce(sum(case when ${auditLogs.action} = 'discount' and ${auditLogs.metadata}->>'amount' ~ '^[0-9]+$' then (${auditLogs.metadata}->>'amount')::int else 0 end), 0)::int`,
          closes: sql<number>`count(*) filter (where ${auditLogs.action} = 'day_close')::int`,
          approvals: sql<number>`count(*) filter (where ${auditLogs.approval} not in ('recorded', 'Recorded'))::int`,
        })
        .from(auditLogs)
        .where(periodWhere),
    ])

    const total = totals?.total ?? events.length
    const rows = events as EventRow[]
    return NextResponse.json({
      events: rows,
      total,
      limit,
      offset,
      hasMore: total > offset + rows.length,
      businessDate: businessDate(),
      timeZone: BAR_TIME_ZONE,
      facets: {
        actions: actionFacets.sort((a, b) => b.count - a.count),
        entityTypes: entityFacets.filter((facet) => facet.entityType).sort((a, b) => b.count - a.count),
      },
      summary: summary ?? { total: 0, voids: 0, discounts: 0, discountAmount: 0, closes: 0, approvals: 0 },
    })
  } catch (error) {
    return (
      authErrorResponse(error) ??
      databaseErrorResponse(error) ??
      NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
    )
  }
}

export const runtime = 'nodejs'
