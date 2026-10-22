import { and, eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { hashPin, isLegacyPinHash, verifyPin } from '@/lib/pin'
import { memberships, user as users, userPins, workspaces } from '@/lib/db/schema'

export type Role = 'Owner' | 'Admin' | 'Manager' | 'Cashier' | 'Storekeeper'
export type Permission =
  | 'menu.manage'
  | 'team.manage'
  | 'settings.read'
  | 'settings.write'
  | 'inventory.manage'
  | 'day.close'
  | 'sales.read'
  | 'sales.create'
  | 'sales.void'
  | 'tabs.manage'
  | 'tabs.void'
  | 'reports.read'
  | 'audit.read'

export const PERMISSION_ROLES: Record<Permission, readonly Role[]> = {
  'menu.manage': ['Owner', 'Admin', 'Manager'],
  'team.manage': ['Owner', 'Admin', 'Manager'],
  'settings.read': ['Owner', 'Admin', 'Manager'],
  'settings.write': ['Owner', 'Admin', 'Manager'],
  'inventory.manage': ['Owner', 'Admin', 'Manager', 'Storekeeper'],
  'day.close': ['Owner', 'Admin', 'Manager'],
  'sales.read': ['Owner', 'Admin', 'Manager', 'Cashier'],
  'sales.create': ['Owner', 'Admin', 'Manager', 'Cashier'],
  'sales.void': ['Owner', 'Admin', 'Manager'],
  'tabs.manage': ['Owner', 'Admin', 'Manager', 'Cashier'],
  'tabs.void': ['Owner', 'Admin', 'Manager'],
  'reports.read': ['Owner', 'Admin', 'Manager'],
  'audit.read': ['Owner', 'Admin', 'Manager'],
}

/** Human wording used by the permission matrix in the Team page. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'menu.manage': 'Menu, prices and recipes',
  'team.manage': 'Team and invitations',
  'settings.read': 'View business settings',
  'settings.write': 'Change business settings',
  'inventory.manage': 'Stock, deliveries and transfers',
  'day.close': 'Open and close the trading day',
  'sales.read': 'View sales',
  'sales.create': 'Record sales and payments',
  'sales.void': 'Approve discounts and sale voids',
  'tabs.manage': 'Open and settle tabs',
  'tabs.void': 'Approve tab voids',
  'reports.read': 'View reports and profit figures',
  'audit.read': 'Read the audit log',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Owner: 'Created the workspace. Cannot be removed or demoted, and is the only role that can transfer ownership.',
  Admin: 'Runs the business day to day, including team, settings and overrides.',
  Manager: 'Shift supervisor. Can approve voids and discounts with their PIN.',
  Cashier: 'Till operator. Sells, opens tabs, and requests approval for voids.',
  Storekeeper: 'Stock custodian. Receives deliveries and records counts.',
}

export class AccessControlError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message)
    this.name = 'AccessControlError'
  }
}

/** Return null rather than granting a privileged role for missing or invalid values. */
export function normalizeRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null

  switch (value.toLowerCase()) {
    case 'owner':
      return 'Owner'
    case 'admin':
      return 'Admin'
    case 'manager':
      return 'Manager'
    case 'cashier':
      return 'Cashier'
    case 'storekeeper':
      return 'Storekeeper'
    default:
      return null
  }
}

export type SessionUser = { id: string; name?: string | null; email?: string | null }

/** Session identity only. Used by sign-up completion, where creating a workspace too early would be wrong. */
export async function requireSessionUser(): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new AccessControlError('Unauthorized', 401)
  return { id: session.user.id, name: session.user.name, email: session.user.email }
}

type WorkspaceMembership = {
  workspaceId: string
  workspaceName: string
  ownerId: string
  role: string
}

async function readWorkspace(userId: string): Promise<WorkspaceMembership | null> {
  const [row] = await db
    .select({
      workspaceId: memberships.workspaceId,
      workspaceName: workspaces.name,
      ownerId: workspaces.ownerId,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
    // Owned workspace wins, otherwise the oldest membership.
    .orderBy(sql`case when ${workspaces.ownerId} = ${userId} then 0 else 1 end`, memberships.createdAt)
    .limit(1)

  return row ?? null
}

/**
 * Resolve the workspace a request belongs to. Accounts created before workspaces existed
 * are adopted lazily: the first request creates their workspace and Owner membership.
 */
async function resolveWorkspace(user: SessionUser): Promise<WorkspaceMembership> {
  const existing = await readWorkspace(user.id)
  if (existing) return existing

  const workspaceId = `ws_${user.id}`
  const firstName = (user.name ?? '').trim().split(/\s+/)[0]
  const fallbackName = `${firstName || 'My'}${firstName ? "'s" : ''} bar`

  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: fallbackName, ownerId: user.id })
    .onConflictDoNothing()
  await db
    .insert(memberships)
    .values({ id: `mem_${user.id}`, workspaceId, userId: user.id, role: 'Owner', status: 'active' })
    .onConflictDoNothing()

  const created = await readWorkspace(user.id)
  if (!created) throw new AccessControlError('Forbidden', 403)
  return created
}

/**
 * Resolve the session identity, the active workspace, and the role from the membership.
 *
 * `id` is deliberately the **workspace owner id** because every data table is keyed by it;
 * `actorId` is the signed-in person and is what audit rows and approvals must record.
 */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const [currentUser] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (!currentUser) return null

  const workspace = await resolveWorkspace({
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
  })
  const role = normalizeRole(workspace.role) ?? normalizeRole(currentUser.role)
  if (!role) return null

  return {
    /** Tenant key used by every existing `user_id` column. */
    id: workspace.ownerId,
    actorId: currentUser.id,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    role,
    name: currentUser.name,
    email: currentUser.email,
  }
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>

/** Require an authenticated Better Auth session backed by an existing user row. */
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) throw new AccessControlError('Unauthorized', 401)
  return user
}

/** Owner and Admin may perform any role-gated action. */
export async function requireRole(allowed: Role | Role[]) {
  const user = await requireAuth()
  const allowedList = Array.isArray(allowed) ? allowed : [allowed]

  if (user.role !== 'Owner' && user.role !== 'Admin' && !allowedList.includes(user.role)) {
    throw new AccessControlError('Forbidden', 403)
  }

  return user
}

/** Require a named capability using the role matrix shared with the API. */
export async function requirePermission(permission: Permission) {
  return requireRole([...PERMISSION_ROLES[permission]])
}

/** Capabilities granted to a role; Owner and Admin hold every capability. */
export function permissionsForRole(role: Role): Permission[] {
  if (role === 'Owner' || role === 'Admin') return Object.keys(PERMISSION_ROLES) as Permission[]
  return (Object.keys(PERMISSION_ROLES) as Permission[]).filter((permission) =>
    PERMISSION_ROLES[permission].includes(role),
  )
}

/** Seniority used to stop a member granting or managing a role above their own. */
export const ROLE_RANK: Record<Role, number> = {
  Owner: 100,
  Admin: 80,
  Manager: 60,
  Cashier: 40,
  Storekeeper: 40,
}

/** Verify a PIN against the person's own stored hash. */
export async function verifyUserPin(userId: string, pin: unknown) {
  if (typeof pin !== 'string' || pin.length === 0) return false

  const [stored] = await db
    .select({ pinHash: userPins.pinHash })
    .from(userPins)
    .where(eq(userPins.userId, userId))
    .limit(1)

  if (!stored || !verifyPin(pin, stored.pinHash)) return false

  if (isLegacyPinHash(stored.pinHash)) {
    await db.update(userPins).set({ pinHash: hashPin(pin) }).where(eq(userPins.userId, userId))
  }

  return true
}

/** Convert access denials into HTTP responses; leave operational errors to callers. */
export function authErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AccessControlError)) return null

  const message = error.status === 403 ? 'Forbidden – insufficient permissions' : 'Unauthorized'
  return NextResponse.json({ error: message }, { status: error.status })
}

/** Compatibility helper for route handlers using a catch-all auth response. */
export function handleAuthError(error: unknown) {
  return (
    authErrorResponse(error) ??
    NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  )
}
