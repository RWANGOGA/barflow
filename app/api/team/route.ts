import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { NextResponse } from 'next/server'
import { authErrorResponse, PERMISSION_LABELS, PERMISSION_ROLES, requirePermission, ROLE_DESCRIPTIONS, ROLE_RANK, type Permission, type Role } from '@/lib/permissions'
import { db } from '@/lib/db'
import { invitations, memberships, user as users, workspaces } from '@/lib/db/schema'

const inviter = alias(users, 'inviter')

/**
 * Members are the people who can sign in to this workspace. The legacy roster table is
 * deliberately not used here: a role that cannot authenticate is not access control.
 */
export async function GET() {
  try {
    const user = await requirePermission('team.manage')
    const [workspace] = await db
      .select({ id: workspaces.id, name: workspaces.name, ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, user.workspaceId))
      .limit(1)

    const memberRows = await db
      .select({
        id: memberships.id,
        userId: memberships.userId,
        name: users.name,
        email: users.email,
        role: memberships.role,
        status: memberships.status,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, user.workspaceId))
      .orderBy(asc(memberships.createdAt))

    const pending = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
        invitedBy: inviter.name,
      })
      .from(invitations)
      .leftJoin(inviter, eq(inviter.id, invitations.invitedBy))
      .where(and(
        eq(invitations.workspaceId, user.workspaceId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ))
      .orderBy(asc(invitations.createdAt))

    const matrix = (Object.keys(PERMISSION_ROLES) as Permission[]).map((permission) => ({
      permission,
      label: PERMISSION_LABELS[permission],
      roles: PERMISSION_ROLES[permission],
    }))

    return NextResponse.json({
      workspace,
      me: { actorId: user.actorId, name: user.name, email: user.email, role: user.role },
      members: memberRows.map((member) => ({
        ...member,
        isOwner: member.role === 'Owner',
      })),
      invitations: pending,
      matrix,
      roles: (Object.keys(ROLE_RANK) as Role[]).map((role) => ({
        role,
        rank: ROLE_RANK[role],
        description: ROLE_DESCRIPTIONS[role],
        grantable: role !== 'Owner',
      })),
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load team' }, { status: 500 })
  }
}
