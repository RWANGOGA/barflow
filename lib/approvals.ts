import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memberships, pinAttempts, user as users, userPins } from '@/lib/db/schema'
import { verifyPin } from '@/lib/pin'
import { verifyUserPin, type CurrentUser, type Role } from '@/lib/permissions'

const WINDOW_MINUTES = 10
const MAX_FAILURES = 5
const MANAGER_ROLES: Role[] = ['Owner', 'Admin', 'Manager']

export type ApprovalMethod = 'self_confirm' | 'manager_pin' | 'owner_override' | 'admin_override'

export type Approval = {
  method: ApprovalMethod
  approverId: string
  approverName: string
}

export class ApprovalError extends Error {
  constructor(
    message: string,
    public readonly status: 403 | 429,
  ) {
    super(message)
    this.name = 'ApprovalError'
  }
}

export function approvalErrorResponse(error: unknown) {
  if (error instanceof ApprovalError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  return null
}

async function recordAttempt(user: CurrentUser, success: boolean) {
  await db.insert(pinAttempts).values({
    id: crypto.randomUUID(),
    workspaceId: user.workspaceId,
    userId: user.actorId,
    success,
  })
}

async function recentFailures(user: CurrentUser) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000)
  const [row] = await db
    .select({ failures: sql<number>`count(*) filter (where not ${pinAttempts.success})::int` })
    .from(pinAttempts)
    .where(and(eq(pinAttempts.userId, user.actorId), gte(pinAttempts.attemptedAt, since)))

  return row?.failures ?? 0
}

/**
 * Authorise a sensitive action and say who approved it.
 *
 * - Owner/Admin: confirm with their own PIN when they have one, otherwise an explicit override
 *   is recorded (never a silent one).
 * - Manager: must confirm with their own PIN.
 * - Cashier/Storekeeper: any active manager, admin or owner in the workspace may enter their
 *   PIN at the till, which is how a second person actually approves.
 */
export async function authorizeSensitiveAction(user: CurrentUser, pin: unknown): Promise<Approval> {
  if ((await recentFailures(user)) >= MAX_FAILURES) {
    throw new ApprovalError(
      `Too many incorrect approval PINs. Try again in ${WINDOW_MINUTES} minutes.`,
      429,
    )
  }

  const submitted = typeof pin === 'string' ? pin.trim() : ''

  if (user.role === 'Owner' || user.role === 'Admin') {
    const [own] = await db
      .select({ pinHash: userPins.pinHash })
      .from(userPins)
      .where(eq(userPins.userId, user.actorId))
      .limit(1)

    if (!own) {
      return {
        method: user.role === 'Owner' ? 'owner_override' : 'admin_override',
        approverId: user.actorId,
        approverName: user.name,
      }
    }

    if (await verifyUserPin(user.actorId, submitted)) {
      await recordAttempt(user, true)
      return { method: 'self_confirm', approverId: user.actorId, approverName: user.name }
    }

    await recordAttempt(user, false)
    throw new ApprovalError('Enter your approval PIN to confirm this action.', 403)
  }

  if (user.role === 'Manager') {
    if (!submitted) throw new ApprovalError('Enter your approval PIN to confirm this action.', 403)
    const [own] = await db
      .select({ pinHash: userPins.pinHash })
      .from(userPins)
      .where(eq(userPins.userId, user.actorId))
      .limit(1)
    if (!own) {
      throw new ApprovalError('Set your approval PIN in Settings before approving this action.', 403)
    }
    const ok = await verifyUserPin(user.actorId, submitted)
    await recordAttempt(user, ok)
    if (!ok) throw new ApprovalError('That approval PIN is incorrect.', 403)
    return { method: 'self_confirm', approverId: user.actorId, approverName: user.name }
  }

  if (!submitted) {
    throw new ApprovalError('A manager must enter their approval PIN.', 403)
  }

  const candidates = await db
    .select({ userId: users.id, name: users.name, pinHash: userPins.pinHash })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(userPins, eq(userPins.userId, memberships.userId))
    .where(and(
      eq(memberships.workspaceId, user.workspaceId),
      eq(memberships.status, 'active'),
      inArray(memberships.role, MANAGER_ROLES),
    ))
    .limit(20)

  for (const candidate of candidates) {
    if (!verifyPin(submitted, candidate.pinHash)) continue
    await recordAttempt(user, true)
    return { method: 'manager_pin', approverId: candidate.userId, approverName: candidate.name }
  }

  await recordAttempt(user, false)
  throw new ApprovalError('That manager PIN is incorrect.', 403)
}
