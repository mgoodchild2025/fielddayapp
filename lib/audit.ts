import { createServiceRoleClient } from '@/lib/supabase/service'

/**
 * Audit log actions. Add new ones here as more system events are tracked.
 * Convention: '<domain>.<verb>' — e.g. 'event.deleted', 'subscription.changed'.
 */
export const AUDIT_ACTIONS = {
  EVENT_DELETED:  'event.deleted',   // soft-delete (moved to trash)
  EVENT_RESTORED: 'event.restored',  // restored from trash
  EVENT_PURGED:   'event.purged',    // permanently deleted
} as const

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS] | (string & {})

export interface AuditEntry {
  orgId: string
  actorUserId?: string | null   // null = system/cron
  actorLabel?: string | null    // snapshot of who did it (name/email)
  action: AuditAction
  targetType?: string | null    // e.g. 'league'
  targetId?: string | null
  targetLabel?: string | null   // snapshot label, survives target deletion
  metadata?: Record<string, unknown>
}

/**
 * Record an audit log entry. Non-fatal — failures are logged and swallowed so
 * audit logging never blocks the underlying action.
 */
export async function recordAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('audit_logs').insert({
      organization_id: entry.orgId,
      actor_user_id:   entry.actorUserId ?? null,
      actor_label:     entry.actorLabel ?? null,
      action:          entry.action,
      target_type:     entry.targetType ?? null,
      target_id:       entry.targetId ?? null,
      target_label:    entry.targetLabel ?? null,
      metadata:        entry.metadata ?? {},
    })
  } catch (err) {
    console.error('[audit] failed to record log:', entry.action, err)
  }
}

/** Human-readable label for an audit action (for the log viewer). */
export function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    'event.deleted':  'Event moved to trash',
    'event.restored': 'Event restored',
    'event.purged':   'Event permanently deleted',
  }
  return map[action] ?? action
}
