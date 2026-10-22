import { NextResponse } from 'next/server'
import { authErrorResponse, permissionsForRole, requireAuth } from '@/lib/permissions'

/** Identity, workspace, and effective capabilities for the signed-in person. */
export async function GET() {
  try {
    const user = await requireAuth()
    return NextResponse.json({
      actorId: user.actorId,
      name: user.name,
      email: user.email,
      role: user.role,
      workspace: { id: user.workspaceId, name: user.workspaceName },
      permissions: permissionsForRole(user.role),
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load identity' }, { status: 500 })
  }
}
