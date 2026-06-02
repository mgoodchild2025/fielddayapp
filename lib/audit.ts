import { createServiceRoleClient } from '@/lib/supabase/service'

/**
 * Audit log actions. Add new ones here as more system events are tracked.
 * Convention: '<domain>.<verb>' — e.g. 'event.deleted', 'subscription.changed'.
 */
export const AUDIT_ACTIONS = {
  EVENT_DELETED:  'event.deleted',   // soft-delete (moved to trash)
  EVENT_RESTORED: 'event.restored',  // restored from trash
  EVENT_PURGED:   'event.purged',    // permanently deleted

  // ── Tier 1: security / access ──────────────────────────────────────────────
  MEMBER_ROLE_CHANGED:     'member.role_changed',
  MEMBER_REMOVED:          'member.removed',
  IMPERSONATION_STARTED:   'impersonation.started',
  IMPERSONATION_ENDED:     'impersonation.ended',
  MFA_ENROLLED:            'mfa.enrolled',
  MFA_DISABLED:            'mfa.disabled',
  MFA_BACKUP_CODE_USED:    'mfa.backup_code_used',

  // ── Tier 1: financial / lifecycle ──────────────────────────────────────────
  SUBSCRIPTION_CHANGED:      'subscription.changed',
  SUBSCRIPTION_HIBERNATED:   'subscription.hibernated',
  SUBSCRIPTION_RESUMED:      'subscription.resumed',
  PAYMENT_MANUAL_RECORDED:   'payment.manual_recorded',
  ACCOUNT_CLOSURE_REQUESTED: 'account.closure_requested',
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

/**
 * Resolve the acting user from the current session for an audit entry.
 * Swallows errors (returns nulls) so it never blocks the underlying action.
 */
export async function getAuditActor(): Promise<{ actorUserId: string | null; actorLabel: string | null }> {
  try {
    const { createServerClient } = await import('@/lib/supabase/server')
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { actorUserId: null, actorLabel: null }
    return { actorUserId: user.id, actorLabel: user.email ?? null }
  } catch {
    return { actorUserId: null, actorLabel: null }
  }
}

/** Human-readable label for an audit action (for the log viewer). */
export function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    'event.deleted':  'Event moved to trash',
    'event.restored': 'Event restored',
    'event.purged':   'Event permanently deleted',
    'member.role_changed':       'Member role changed',
    'member.removed':            'Member removed',
    'impersonation.started':     'Impersonation started',
    'impersonation.ended':       'Impersonation ended',
    'mfa.enrolled':              'Two-factor enabled',
    'mfa.disabled':              'Two-factor disabled',
    'mfa.backup_code_used':      'Backup code used',
    'subscription.changed':      'Subscription changed',
    'subscription.hibernated':   'Subscription hibernated',
    'subscription.resumed':      'Subscription resumed',
    'payment.manual_recorded':   'Manual payment recorded',
    'account.closure_requested': 'Account closure requested',
  }
  return map[action] ?? action
}
