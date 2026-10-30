import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, permissionsForRole, requireAuth } from '@/lib/permissions'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { regionalFor } from '@/lib/regional'

/**
 * Identity, workspace, effective capabilities, and the regional settings this device needs
 * to render money and dates. Regional settings travel with identity so a cashier, who may not
 * read the settings endpoint, still sees the right currency and tax treatment.
 *
 * `barName` prefers the receipt header an operator configured over the workspace label.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const [regional, [nameRow]] = await Promise.all([
      regionalFor(user.id),
      db
        .select({ value: settings.value })
        .from(settings)
        .where(and(eq(settings.userId, user.id), eq(settings.key, 'bar_name')))
        .limit(1),
    ])
    return NextResponse.json({
      actorId: user.actorId,
      name: user.name,
      email: user.email,
      role: user.role,
      workspace: { id: user.workspaceId, name: user.workspaceName },
      barName: nameRow?.value?.trim() || user.workspaceName,
      permissions: permissionsForRole(user.role),
      regional,
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load identity' }, { status: 500 })
  }
}
