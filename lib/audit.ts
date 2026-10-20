import { auditLogs } from '@/lib/db/schema'

type AuditActor = { id: string; role: string | null }

type AuditEventInput = {
  action: string
  recordLabel: string
  entityType?: string | null
  entityId?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
  approval?: 'admin' | 'manager' | 'Recorded'
}

/**
 * Build a bar_audit_log row. Events are written by the server that performed the change,
 * never accepted from the client. The acting role is stored as a snapshot so history stays
 * accurate after a person is promoted or demoted.
 */
export function auditEvent(actor: AuditActor, event: AuditEventInput): typeof auditLogs.$inferInsert {
  return {
    id: crypto.randomUUID(),
    userId: actor.id,
    actorRole: actor.role,
    action: event.action,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    reason: event.reason?.trim() || null,
    metadata: event.metadata ?? {},
    recordLabel: event.recordLabel,
    approval: event.approval ?? (actor.role === 'Admin' ? 'admin' : 'manager'),
  }
}
