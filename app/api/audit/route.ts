import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { databaseErrorResponse } from '@/lib/db-errors'
import { db } from '@/lib/db'
import { addDays, startOfDay } from '@/lib/time'
import { auditLogs, user as users } from '@/lib/db/schema'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 300

/** Parse a business date as the UTC instant of local midnight, matching the bar's timezone. */
function boundary(value: string | null, exclusiveNextDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  // Noon UTC always falls on the same calendar date in the bar's zone.
  const noon = new Date(`${value}T12:00:00.000Z`)
  if (Number.isNaN(noon.getTime())) return null
  const start = startOfDay(noon)
  return exclusiveNextDay ? addDays(start, 1) : start
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
    const from = boundary(url.searchParams.get('from'))
    const to = boundary(url.searchParams.get('to'), true)
    const requestedLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_LIMIT)
      : DEFAULT_LIMIT

    const filters = [eq(auditLogs.userId, user.id)]
    if (action && action !== 'all') filters.push(eq(auditLogs.action, action.slice(0, 120)))
    if (entityType) filters.push(eq(auditLogs.entityType, entityType.slice(0, 60)))
    if (from) filters.push(gte(auditLogs.createdAt, from))
    if (to) filters.push(lt(auditLogs.createdAt, to))
    const where = and(...filters)

    const [events, [totals]] = await Promise.all([
      db
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
        // A left join keeps the event visible even if the account row is gone.
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit),
      db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
    ])

    const total = totals?.total ?? events.length
    return NextResponse.json({ events, total, limit, hasMore: total > events.length })
  } catch (error) {
    return (
      authErrorResponse(error) ??
      databaseErrorResponse(error) ??
      NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
    )
  }
}

export const runtime = 'nodejs'
