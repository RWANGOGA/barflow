import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireAuth } from '@/lib/permissions'
import { db } from '@/lib/db'
import { teamMembers } from '@/lib/db/schema'

/**
 * Waiter picker source for the New sale page.
 * Any signed-in user may read the roster (name and role only), not the full team record.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const rows = await db
      .select({ id: teamMembers.id, name: teamMembers.name, role: teamMembers.role })
      .from(teamMembers)
      .where(eq(teamMembers.userId, user.id))
      .orderBy(asc(teamMembers.name))

    return NextResponse.json(rows)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load waiters' }, { status: 500 })
  }
}
