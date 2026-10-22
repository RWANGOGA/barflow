import { auditLogs } from '@/lib/db/schema'

type AuditActor = { id: string; actorId?: string | null; role: string | null }

export type AuditApproval =
  | 'recorded'
  | 'self_confirm'
  | 'manager_pin'
  | 'owner_override'
  | 'admin_override'
  // Legacy rows written before approvals were modelled explicitly.
  | 'Recorded'
  | 'admin'
  | 'manager'

type AuditEventInput = {
  action: string
  recordLabel: string
  entityType?: string | null
  entityId?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
  approval?: AuditApproval
}

/**
 * Build a bar_audit_log row. Events are written by the server that performed the change,
 * never accepted from the client. `userId` stays the workspace tenant key while `actorId`
 * records the person who actually acted, so a shared workspace keeps per-person history.
 */
export function auditEvent(actor: AuditActor, event: AuditEventInput): typeof auditLogs.$inferInsert {
  return {
    id: crypto.randomUUID(),
    userId: actor.id,
    actorId: actor.actorId ?? null,
    actorRole: actor.role,
    action: event.action,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    reason: event.reason?.trim() || null,
    metadata: event.metadata ?? {},
    recordLabel: event.recordLabel,
    // Approvals are recorded only when an approval step actually happened.
    approval: event.approval ?? 'recorded',
  }
}
