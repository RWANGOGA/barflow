import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auditEvent } from '@/lib/audit'
import { authErrorResponse, requireAuth, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { auditLogs, settings, workspaces } from '@/lib/db/schema'

/** The signed-in person's workspace, including their role. */
export async function GET() {
  try {
    const user = await requireAuth()
    return NextResponse.json({
      id: user.workspaceId,
      name: user.workspaceName,
      role: user.role,
      actorId: user.actorId,
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load workspace' }, { status: 500 })
  }
}

/** Name the workspace during onboarding. Mirrors the value into settings for receipts. */
export async function POST(request: Request) {
  try {
    // Renaming the bar changes receipts and every staff screen, so it needs settings access.
    const user = await requirePermission('settings.write')
    const body = await request.json()
    const name =
      typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 60) : ''

    if (name.length < 2) {
      return NextResponse.json({ error: 'Enter the bar name (at least 2 characters).' }, { status: 400 })
    }

    await db.transaction(async (tx) => {
      await tx
        .update(workspaces)
        .set({ name, updatedAt: new Date() })
        .where(eq(workspaces.id, user.workspaceId))

      // Receipts and the sidebar read bar_name from settings, so keep both in step.
      await tx
        .insert(settings)
        .values({ userId: user.id, key: 'bar_name', value: name })
        .onConflictDoUpdate({
          target: [settings.userId, settings.key],
          set: { value: name, updatedAt: new Date() },
        })

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'workspace_rename',
        entityType: 'workspace',
        entityId: user.workspaceId,
        recordLabel: name,
        metadata: { previous: user.workspaceName, name },
        approval: 'recorded',
      }))
    })

    return NextResponse.json({ id: user.workspaceId, name, role: user.role }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save the workspace' }, { status: 400 })
  }
}
