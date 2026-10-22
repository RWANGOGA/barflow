import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auditEvent } from '@/lib/audit'
import { authErrorResponse, requirePermission, ROLE_RANK, type Role } from '@/lib/permissions'
import { db } from '@/lib/db'
import { auditLogs, memberships, session as sessions, user as users } from '@/lib/db/schema'

const ASSIGNABLE: Role[] = ['Admin', 'Manager', 'Cashier', 'Storekeeper']

async function loadTarget(workspaceId: string, membershipId: string) {
  const [target] = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.id, membershipId), eq(memberships.workspaceId, workspaceId)))
    .limit(1)

  return target ?? null
}

/** Change a member's role. Nobody can grant a role above their own or touch the Owner. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('team.manage')
    const { id } = await params
    const body = await request.json()
    const role = typeof body.role === 'string' ? body.role : ''

    if (!ASSIGNABLE.includes(role as Role)) {
      return NextResponse.json({ error: 'Choose a valid role.' }, { status: 400 })
    }

    const target = await loadTarget(user.workspaceId, id)
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (target.role === 'Owner') {
      return NextResponse.json({ error: 'The owner’s role cannot be changed.' }, { status: 403 })
    }
    if (target.userId === user.actorId) {
      return NextResponse.json({ error: 'You cannot change your own role. Ask the owner.' }, { status: 400 })
    }
    if (ROLE_RANK[target.role as Role] >= ROLE_RANK[user.role] && user.role !== 'Owner') {
      return NextResponse.json({ error: 'You cannot change a member at or above your own role.' }, { status: 403 })
    }
    if (ROLE_RANK[role as Role] > ROLE_RANK[user.role]) {
      return NextResponse.json({ error: 'You cannot grant more access than your own role.' }, { status: 403 })
    }
    if (target.role === role) return NextResponse.json({ ok: true, role })

    await db.transaction(async (tx) => {
      await tx
        .update(memberships)
        .set({ role, updatedAt: new Date() })
        .where(eq(memberships.id, target.id))

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'team_role_change',
        entityType: 'membership',
        entityId: target.id,
        recordLabel: `${target.name} (${target.email})`,
        metadata: { from: target.role, to: role, email: target.email },
        approval: 'recorded',
      }))
    })

    return NextResponse.json({ ok: true, role })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not change the role' }, { status: 400 })
  }
}

/** Remove a member and end their sessions so access stops immediately. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('team.manage')
    const { id } = await params
    const target = await loadTarget(user.workspaceId, id)

    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (target.role === 'Owner') {
      return NextResponse.json({ error: 'The owner cannot be removed.' }, { status: 403 })
    }
    if (target.userId === user.actorId) {
      return NextResponse.json({ error: 'You cannot remove yourself. Ask the owner.' }, { status: 400 })
    }
    if (ROLE_RANK[target.role as Role] >= ROLE_RANK[user.role] && user.role !== 'Owner') {
      return NextResponse.json({ error: 'You cannot remove a member at or above your own role.' }, { status: 403 })
    }

    await db.transaction(async (tx) => {
      await tx.delete(memberships).where(eq(memberships.id, target.id))
      // Sessions are global to the account; ending them is the safest offboarding step.
      await tx.delete(sessions).where(eq(sessions.userId, target.userId))

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'team_remove',
        entityType: 'membership',
        entityId: target.id,
        recordLabel: `${target.name} (${target.email})`,
        metadata: { email: target.email, role: target.role },
        approval: 'recorded',
      }))
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not remove the member' }, { status: 400 })
  }
}
