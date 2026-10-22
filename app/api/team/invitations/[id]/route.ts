import { and, eq, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auditEvent } from '@/lib/audit'
import { authErrorResponse, requirePermission, ROLE_RANK, type Role } from '@/lib/permissions'
import { db } from '@/lib/db'
import { auditLogs, invitations } from '@/lib/db/schema'

/** Revoke a pending invitation. The code stops working immediately. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('team.manage')
    const { id } = await params
    const [invite] = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
      })
      .from(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.workspaceId, user.workspaceId)))
      .limit(1)

    if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    if (invite.acceptedAt) {
      return NextResponse.json({ error: 'This invitation was already accepted. Remove the member instead.' }, { status: 400 })
    }
    if (ROLE_RANK[invite.role as Role] > ROLE_RANK[user.role]) {
      return NextResponse.json({ error: 'You cannot revoke an invitation above your own role.' }, { status: 403 })
    }
    if (invite.revokedAt) return NextResponse.json({ ok: true })

    await db.transaction(async (tx) => {
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.id, invite.id), isNull(invitations.acceptedAt)))

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'invitation_revoke',
        entityType: 'invitation',
        entityId: invite.id,
        recordLabel: `${invite.email} (${invite.role})`,
        metadata: { email: invite.email, role: invite.role },
        approval: 'recorded',
      }))
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not revoke the invitation' }, { status: 400 })
  }
}
