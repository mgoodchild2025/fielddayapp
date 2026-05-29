'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email'

// ── Global maintenance mode ───────────────────────────────────────────────────

export interface GlobalMaintenanceSettings {
  enabled: boolean
  message: string | null
  until: string | null  // ISO 8601 or null
}

export async function getGlobalMaintenance(): Promise<GlobalMaintenanceSettings> {
  const service = createServiceRoleClient()
  const { data } = await service
    .from('platform_settings')
    .select('key, value')
    .in('key', ['maintenance_mode_all', 'maintenance_mode_message', 'maintenance_mode_until'])

  const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
  return {
    enabled: map.get('maintenance_mode_all') === 'true',
    message: map.get('maintenance_mode_message') ?? null,
    until:   map.get('maintenance_mode_until') ?? null,
  }
}

export async function setGlobalMaintenance(
  enabled: boolean,
  message: string | null,
  until: string | null,
): Promise<{ error: string | null }> {
  const service = createServiceRoleClient()
  const now = new Date().toISOString()

  const upserts = [
    { key: 'maintenance_mode_all', value: enabled ? 'true' : 'false', updated_at: now },
  ]

  if (message && message.trim()) {
    upserts.push({ key: 'maintenance_mode_message', value: message.trim(), updated_at: now })
  }
  if (until) {
    upserts.push({ key: 'maintenance_mode_until', value: until, updated_at: now })
  }

  await service.from('platform_settings').upsert(upserts, { onConflict: 'key' })

  // Clear message/until when turning off or when they're empty
  const keysToDelete: string[] = []
  if (!message?.trim()) keysToDelete.push('maintenance_mode_message')
  if (!until) keysToDelete.push('maintenance_mode_until')
  if (keysToDelete.length > 0) {
    await service.from('platform_settings').delete().in('key', keysToDelete)
  }

  revalidatePath('/super/settings')
  revalidatePath('/', 'layout')
  return { error: null }
}

export async function setSignupsEnabled(enabled: boolean) {
  const service = createServiceRoleClient()
  await service
    .from('platform_settings')
    .upsert(
      { key: 'signups_enabled', value: enabled ? 'true' : 'false', updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
  revalidatePath('/super/settings')
  revalidatePath('/signup')
  return { error: null }
}

export async function getSignupsEnabled(): Promise<boolean> {
  const service = createServiceRoleClient()
  const { data } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'signups_enabled')
    .single()
  return data?.value !== 'false'
}

/** Returns the configured new-org notification email, or null if not set. */
export async function getNewOrgNotificationEmail(): Promise<string | null> {
  const service = createServiceRoleClient()
  const { data } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'new_org_notification_email')
    .single()
  return data?.value?.trim() || null
}

export async function setNewOrgNotificationEmail(
  email: string | null
): Promise<{ error: string | null }> {
  const service = createServiceRoleClient()

  if (email && email.trim()) {
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return { error: 'Invalid email address' }
    }
    await service
      .from('platform_settings')
      .upsert(
        { key: 'new_org_notification_email', value: email.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
  } else {
    // Clearing the setting
    await service
      .from('platform_settings')
      .delete()
      .eq('key', 'new_org_notification_email')
  }

  revalidatePath('/super/settings')
  return { error: null }
}

// ── Platform Alerts ───────────────────────────────────────────────────────────

export type AlertType =
  | 'new_org'
  | 'subscription_change'
  | 'trial_expiring'
  | 'billing_failure'
  | 'account_deletion'

export interface PlatformAlerts {
  email: string | null          // recipient — null means all platform admins
  newOrg: boolean
  subscriptionChange: boolean
  trialExpiring: boolean
  billingFailure: boolean
  accountDeletion: boolean
}

const ALERT_KEYS: Record<keyof Omit<PlatformAlerts, 'email'>, string> = {
  newOrg:             'alert_new_org',
  subscriptionChange: 'alert_subscription_change',
  trialExpiring:      'alert_trial_expiring',
  billingFailure:     'alert_billing_failure',
  accountDeletion:    'alert_account_deletion',
}

export async function getPlatformAlerts(): Promise<PlatformAlerts> {
  const service = createServiceRoleClient()
  const { data } = await service
    .from('platform_settings')
    .select('key, value')
    .in('key', ['alert_email', ...Object.values(ALERT_KEYS)])

  const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))

  return {
    email:              map.get('alert_email')?.trim() || null,
    newOrg:             map.get('alert_new_org')             !== 'false',
    subscriptionChange: map.get('alert_subscription_change') !== 'false',
    trialExpiring:      map.get('alert_trial_expiring')      !== 'false',
    billingFailure:     map.get('alert_billing_failure')     !== 'false',
    accountDeletion:    map.get('alert_account_deletion')    !== 'false',
  }
}

export async function setPlatformAlerts(
  alerts: PlatformAlerts
): Promise<{ error: string | null }> {
  const service = createServiceRoleClient()
  const now = new Date().toISOString()

  if (alerts.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alerts.email.trim())) {
    return { error: 'Invalid email address' }
  }

  const upserts: { key: string; value: string; updated_at: string }[] = [
    { key: ALERT_KEYS.newOrg,             value: alerts.newOrg             ? 'true' : 'false', updated_at: now },
    { key: ALERT_KEYS.subscriptionChange, value: alerts.subscriptionChange ? 'true' : 'false', updated_at: now },
    { key: ALERT_KEYS.trialExpiring,      value: alerts.trialExpiring      ? 'true' : 'false', updated_at: now },
    { key: ALERT_KEYS.billingFailure,     value: alerts.billingFailure     ? 'true' : 'false', updated_at: now },
    { key: ALERT_KEYS.accountDeletion,    value: alerts.accountDeletion    ? 'true' : 'false', updated_at: now },
  ]

  if (alerts.email?.trim()) {
    upserts.push({ key: 'alert_email', value: alerts.email.trim(), updated_at: now })
  } else {
    await service.from('platform_settings').delete().eq('key', 'alert_email')
  }

  await service.from('platform_settings').upsert(upserts, { onConflict: 'key' })
  revalidatePath('/super/settings')
  return { error: null }
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
      .in('key', ['alert_email', ALERT_KEYS[type as keyof typeof ALERT_KEYS]])

    const map = new Map((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
    const enabled = map.get(ALERT_KEYS[type as keyof typeof ALERT_KEYS]) !== 'false'
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
