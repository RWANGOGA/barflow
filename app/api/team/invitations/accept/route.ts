import { and, eq, gt, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auditEvent } from '@/lib/audit'
import { authErrorResponse, requireSessionUser } from '@/lib/permissions'
import { hashInviteCode, normalizeInviteCode } from '@/lib/invite'
import { db } from '@/lib/db'
import { auditLogs, invitations, memberships, workspaces } from '@/lib/db/schema'

class AlreadyMemberError extends Error {}

/** Accept an invitation as the signed-in person. The invited email must match the account. */
export async function POST(request: Request) {
  try {
    const session = await requireSessionUser()
    const body = await request.json().catch(() => ({}))
    const code = normalizeInviteCode(body.code)

    if (code.length < 6) {
      return NextResponse.json({ error: 'Enter the invitation code from your manager.' }, { status: 400 })
    }

    const [invite] = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        expiresAt: invitations.expiresAt,
        workspaceId: invitations.workspaceId,
        workspaceName: workspaces.name,
        ownerId: workspaces.ownerId,
      })
      .from(invitations)
      .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
      .where(and(eq(invitations.codeHash, hashInviteCode(code)), isNull(invitations.acceptedAt)))
      .limit(1)

    if (!invite) {
      return NextResponse.json({ error: 'That invitation code is not valid or was already used.' }, { status: 404 })
    }
    if (invite.revokedAt) {
      return NextResponse.json({ error: 'This invitation was revoked. Ask for a new one.' }, { status: 410 })
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'This invitation has expired. Ask for a new one.' }, { status: 410 })
    }

    const accountEmail = (session.email ?? '').trim().toLowerCase()
    if (accountEmail !== invite.email.trim().toLowerCase()) {
      return NextResponse.json(
        { error: `This invitation was sent to a different email address. Sign in as that address to join ${invite.workspaceName}.` },
        { status: 403 },
      )
    }

    // One bar per owner keeps existing data scoping unambiguous.
    const [owned] = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.ownerId, session.id))
      .limit(1)
    if (owned) {
      return NextResponse.json(
        { error: `This account already owns "${owned.name}". Use the invited email with a separate account, or transfer the existing bar first.` },
        { status: 409 },
      )
    }

    const [existing] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, invite.workspaceId), eq(memberships.userId, session.id)))
      .limit(1)
    if (existing) {
      return NextResponse.json({ error: `You are already a member of ${invite.workspaceName}.` }, { status: 409 })
    }

    await db.transaction(async (tx) => {
      const [consumed] = await tx
        .update(invitations)
        .set({ acceptedAt: new Date(), acceptedBy: session.id })
        .where(and(
          eq(invitations.id, invite.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ))
        .returning({ id: invitations.id })

      if (!consumed) throw new AlreadyMemberError('Invitation was already used.')

      const [membership] = await tx
        .insert(memberships)
        .values({
          id: crypto.randomUUID(),
          workspaceId: invite.workspaceId,
          userId: session.id,
          role: invite.role,
          status: 'active',
        })
        .onConflictDoNothing()
        .returning({ id: memberships.id })

      if (!membership) throw new AlreadyMemberError('Already a member.')

      await tx.insert(auditLogs).values(auditEvent(
        { id: invite.ownerId, actorId: session.id, role: invite.role },
        {
          action: 'team_join',
          entityType: 'membership',
          entityId: membership.id,
          recordLabel: `${session.name || session.email} (${invite.role})`,
          metadata: { email: invite.email, role: invite.role, invitationId: invite.id },
          approval: 'recorded',
        },
      ))
    })

    return NextResponse.json(
      { workspace: { id: invite.workspaceId, name: invite.workspaceName }, role: invite.role },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof AlreadyMemberError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not accept the invitation' }, { status: 400 })
  }
}
