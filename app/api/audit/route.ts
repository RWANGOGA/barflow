import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { auditLogs, user as users } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requirePermission('audit.read')
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        recordLabel: auditLogs.recordLabel,
        approval: auditLogs.approval,
        reason: auditLogs.reason,
        createdAt: auditLogs.createdAt,
        userName: users.name,
      })
      .from(auditLogs)
      .innerJoin(users, eq(users.id, auditLogs.userId))
      .where(eq(auditLogs.userId, user.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100)

    return NextResponse.json(rows)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('audit.write')
    const body = await request.json()
    if (typeof body.action !== 'string' || typeof body.recordLabel !== 'string') {
      return NextResponse.json({ error: 'Invalid audit event' }, { status: 400 })
    }

    const [created] = await db
      .insert(auditLogs)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        action: body.action.slice(0, 120),
        recordLabel: body.recordLabel.slice(0, 160),
        // Approval is derived from the signed-in role, never accepted from request data.
        approval: user.role === 'Admin' ? 'admin' : 'manager',
      })
      .returning()

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save audit event' }, { status: 400 })
  }
}

export const runtime = 'nodejs'
