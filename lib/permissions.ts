import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export type Role = 'Admin' | 'Manager' | 'Cashier' | 'Storekeeper'

const ALL_ROLES: Role[] = ['Admin', 'Manager', 'Cashier', 'Storekeeper']

/**
 * Normalize any string into a valid Role.
 * Defaults to Manager for safety (matches current frontend behaviour).
 */
export function normalizeRole(value: unknown): Role {
  const role = String(value ?? 'Manager').toLowerCase()
  if (role === 'admin') return 'Admin'
  if (role === 'cashier') return 'Cashier'
  if (role === 'storekeeper') return 'Storekeeper'
  return 'Manager'
}

/**
 * Get the current authenticated user + normalized role.
 * Returns null if not logged in.
 */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const role = normalizeRole((session.user as any).role)
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role,
  }
}

/**
 * Require authentication. Throws if not logged in.
 */
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

/**
 * Require that the current user has one of the allowed roles.
 * Admin always passes.
 */
export async function requireRole(allowed: Role | Role[]) {
  const user = await requireAuth()
  const allowedList = Array.isArray(allowed) ? allowed : [allowed]

  // Admin can do everything
  if (user.role === 'Admin') return user

  if (!allowedList.includes(user.role)) {
    throw new Error('Forbidden')
  }

  return user
}

/**
 * Helper to turn the thrown errors into proper HTTP responses
 * inside API routes.
 */
export function handleAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unauthorized'

  if (message === 'Forbidden') {
    return NextResponse.json({ error: 'Forbidden – insufficient permissions' }, { status: 403 })
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}