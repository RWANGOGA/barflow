import { and, asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth } from '@/lib/permissions'
import { db } from '@/lib/db'
import { memberships, user as users } from '@/lib/db/schema'

/**
 * Waiter picker source for the New sale page.
 * Any signed-in user may read active member names, never emails or full records.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const rows = await db
      .select({ id: memberships.id, name: users.name, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, user.workspaceId), eq(memberships.status, 'active')))
      .orderBy(asc(users.name))

    return NextResponse.json(rows)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load waiters' }, { status: 500 })
  }
}
