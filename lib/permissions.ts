import { createHash, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user as users, userPins } from '@/lib/db/schema'

export type Role = 'Admin' | 'Manager' | 'Cashier' | 'Storekeeper'
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

const PERMISSION_ROLES: Record<Permission, readonly Role[]> = {
  'menu.manage': ['Admin', 'Manager'],
  'team.manage': ['Admin', 'Manager'],
  'settings.read': ['Admin', 'Manager'],
  'settings.write': ['Admin', 'Manager'],
  'inventory.manage': ['Admin', 'Manager', 'Storekeeper'],
  'day.close': ['Admin', 'Manager'],
  'sales.read': ['Admin', 'Manager', 'Cashier'],
  'sales.create': ['Admin', 'Manager', 'Cashier'],
  'sales.void': ['Admin', 'Manager'],
  'tabs.manage': ['Admin', 'Manager', 'Cashier'],
  'tabs.void': ['Admin', 'Manager'],
  'reports.read': ['Admin', 'Manager'],
  'audit.read': ['Admin', 'Manager'],
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

/** Resolve the session identity, then load the current role from the database. */
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

  return {
    ...currentUser,
    role: normalizeRole(currentUser.role),
  }
}

/** Require an authenticated Better Auth session backed by an existing user row. */
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) throw new AccessControlError('Unauthorized', 401)
  if (!user.role) throw new AccessControlError('Forbidden', 403)
  return user
}

/** Require one of the provided roles. Admin may perform any role-gated action. */
export async function requireRole(allowed: Role | Role[]) {
  const user = await requireAuth()
  const allowedList = Array.isArray(allowed) ? allowed : [allowed]

  if (user.role !== 'Admin' && (!user.role || !allowedList.includes(user.role))) {
    throw new AccessControlError('Forbidden', 403)
  }

  return user
}

/** Require a named capability using the role matrix shared with the API. */
export async function requirePermission(permission: Permission) {
  return requireRole([...PERMISSION_ROLES[permission]])
}

/** Verify a PIN against the account's stored SHA-256 digest. */
export async function verifyUserPin(userId: string, pin: unknown) {
  if (typeof pin !== 'string' || pin.length === 0) return false

  const [stored] = await db
    .select({ pinHash: userPins.pinHash })
    .from(userPins)
    .where(eq(userPins.userId, userId))
    .limit(1)

  if (!stored || !/^[a-f0-9]{64}$/i.test(stored.pinHash)) return false

  const expected = Buffer.from(stored.pinHash, 'hex')
  const actual = createHash('sha256').update(pin).digest()
  return expected.length === actual.length && timingSafeEqual(expected, actual)
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
