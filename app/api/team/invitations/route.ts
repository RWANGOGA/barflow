import { and, eq, gt, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auditEvent } from '@/lib/audit'
import { authErrorResponse, requirePermission, ROLE_RANK, type Role } from '@/lib/permissions'
import { generateInviteCode, hashInviteCode, INVITE_TTL_DAYS } from '@/lib/invite'
import { db } from '@/lib/db'
import { auditLogs, invitations, memberships, user as users } from '@/lib/db/schema'

const INVITABLE: Role[] = ['Admin', 'Manager', 'Cashier', 'Storekeeper']

/** Invite a staff member by email. The role is chosen here, never by the person joining. */
export async function POST(request: Request) {
  try {
    const user = await requirePermission('team.manage')
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
    const role = typeof body.role === 'string' ? body.role : ''

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
    if (!INVITABLE.includes(role as Role)) {
      return NextResponse.json({ error: 'Choose a valid role.' }, { status: 400 })
    }
    if (email === user.email.trim().toLowerCase()) {
      return NextResponse.json({ error: 'You are already a member of this bar.' }, { status: 400 })
    }
    if (ROLE_RANK[role as Role] > ROLE_RANK[user.role]) {
      return NextResponse.json(
        { error: 'You cannot invite someone with more access than your own role.' },
        { status: 403 },
      )
    }

    const [existingMember] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, user.workspaceId), eq(users.email, email)))
      .limit(1)
    if (existingMember) {
      return NextResponse.json({ error: 'That email is already a member of this bar.' }, { status: 409 })
    }

    const code = generateInviteCode()
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

    const created = await db.transaction(async (tx) => {
      // A fresh invite supersedes an older pending one for the same address.
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(invitations.workspaceId, user.workspaceId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ))

      const [row] = await tx
        .insert(invitations)
        .values({
          id: crypto.randomUUID(),
          workspaceId: user.workspaceId,
          email,
          role,
          codeHash: hashInviteCode(code),
          invitedBy: user.actorId,
          expiresAt,
        })
        .returning({
          id: invitations.id,
          email: invitations.email,
          role: invitations.role,
          expiresAt: invitations.expiresAt,
        })

      // The code itself is never written to the audit log.
      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'team_invite',
        entityType: 'invitation',
        entityId: row.id,
        recordLabel: `${email} (${role})`,
        metadata: { email, role, expiresAt: expiresAt.toISOString() },
        approval: 'recorded',
      }))

      return row
    })

    return NextResponse.json({
      invitation: created,
      code,
      expiresAt,
      joinUrl: `/sign-up?mode=join&code=${code}&email=${encodeURIComponent(email)}`,
    }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not create the invitation' }, { status: 400 })
  }
}
