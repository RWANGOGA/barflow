import { NextRequest } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auditLogs } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

async function currentUser(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user
}

export async function GET(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db.select().from(auditLogs).where(eq(auditLogs.userId, user.id)).orderBy(desc(auditLogs.createdAt)).limit(100)
  return Response.json(rows)
}

export async function POST(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  if (typeof body.action !== 'string' || typeof body.recordLabel !== 'string') return Response.json({ error: 'Invalid audit event' }, { status: 400 })
  const [created] = await db.insert(auditLogs).values({ id: crypto.randomUUID(), userId: user.id, action: body.action.slice(0, 120), recordLabel: body.recordLabel.slice(0, 160), approval: typeof body.approval === 'string' ? body.approval.slice(0, 80) : 'Recorded' }).returning()
  return Response.json(created, { status: 201 })
}

export const runtime = 'nodejs'
