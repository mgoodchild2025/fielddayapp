import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email'

// Internal platform-alert helper. Lives in lib/ (NOT an action) on purpose:
// it is called from cron routes, Stripe webhooks, org signup, and billing —
// contexts with no admin session — and must never be a public action endpoint.

export type AlertType =
  | 'new_org'
  | 'subscription_change'
  | 'trial_expiring'
  | 'billing_failure'
  | 'account_deletion'

export const ALERT_KEYS = {
  newOrg:             'alert_new_org',
  subscriptionChange: 'alert_subscription_change',
  trialExpiring:      'alert_trial_expiring',
  billingFailure:     'alert_billing_failure',
  accountDeletion:    'alert_account_deletion',
} as const

const ALERT_KEY_BY_TYPE: Record<AlertType, string> = {
  new_org:             ALERT_KEYS.newOrg,
  subscription_change: ALERT_KEYS.subscriptionChange,
  trial_expiring:      ALERT_KEYS.trialExpiring,
  billing_failure:     ALERT_KEYS.billingFailure,
  account_deletion:    ALERT_KEYS.accountDeletion,
}

/**
 * Send a platform alert email if the given alert type is enabled.
 * Call-sites don't need to check settings — this function handles it.
 */
export async function sendPlatformAlert(
  type: AlertType,
  subject: string,
  html: string
): Promise<void> {
  try {
    const service = createServiceRoleClient()

    // Read alert settings
    const { data: settings } = await service
      .from('platform_settings')
      .select('key, value')
      .in('key', ['alert_email', ALERT_KEY_BY_TYPE[type]])

    const map = new Map((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
    const enabled = map.get(ALERT_KEY_BY_TYPE[type]) !== 'false'
    if (!enabled) return

    // Determine recipients
    const alertEmail = map.get('alert_email')?.trim() || null

    let recipients: string[] = []
    if (alertEmail) {
      recipients = [alertEmail]
    } else {
      // Fall back to all platform admin emails
      const { data: admins } = await service
        .from('profiles')
        .select('email')
        .eq('platform_role', 'platform_admin')
        .not('email', 'is', null)
      recipients = (admins ?? []).map((a: { email: string }) => a.email).filter(Boolean)
    }

    if (recipients.length === 0) return

    await Promise.all(recipients.map(to => sendEmail({ to, subject, html })))
  } catch (err) {
    // Alerts are non-fatal — log but don't throw
    console.error('[platform-alert] failed to send alert:', type, err)
  }
}

/**
 * Email the platform team about a server error. No per-type toggle — used by
 * the error reporter (lib/error-reporter.ts), which throttles per error digest
 * so this only fires for new/recurring-after-quiet errors.
 */
export async function sendErrorAlert(subject: string, html: string): Promise<void> {
  try {
    const service = createServiceRoleClient()

    const { data } = await service
      .from('platform_settings')
      .select('value')
      .eq('key', 'alert_email')
      .maybeSingle()
    const alertEmail = data?.value?.trim() || null

    let recipients: string[] = []
    if (alertEmail) {
      recipients = [alertEmail]
    } else {
      const { data: admins } = await service
        .from('profiles')
        .select('email')
        .eq('platform_role', 'platform_admin')
        .not('email', 'is', null)
      recipients = (admins ?? []).map((a: { email: string }) => a.email).filter(Boolean)
    }

    if (recipients.length === 0) return
    await Promise.all(recipients.map(to => sendEmail({ to, subject, html })))
  } catch (err) {
    console.error('[platform-alert] failed to send error alert:', err)
  }
}
