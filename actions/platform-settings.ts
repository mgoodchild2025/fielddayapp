'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { requirePlatformAdmin } from '@/lib/auth'
import { ALERT_KEYS, sendPlatformAlert } from '@/lib/platform-alerts'
import { platformEnvFor, type StripeMode } from '@/lib/stripe-platform'

// ── Platform Stripe mode (test / live) ──────────────────────────────────────

export interface PlatformStripeModeInfo {
  mode: StripeMode
  liveConfigured: boolean
  testConfigured: boolean
}

/** Current mode + whether each mode's keys are present in env. */
export async function getPlatformStripeModeInfo(): Promise<PlatformStripeModeInfo> {
  await requirePlatformAdmin()
  const service = createServiceRoleClient()

  const { data } = await service
    .from('platform_settings').select('value').eq('key', 'platform_stripe_mode').maybeSingle()
  const live = platformEnvFor('live')
  const test = platformEnvFor('test')
  return {
    mode: data?.value === 'test' ? 'test' : 'live',
    liveConfigured: !!live.secretKey,
    testConfigured: !!test.secretKey,
  }
}

/** Flip the platform Stripe mode. Platform-admin only; alerts + (best-effort) guards. */
export async function setPlatformStripeMode(mode: StripeMode): Promise<{ error: string | null }> {
  if (mode !== 'test' && mode !== 'live') return { error: 'Invalid mode' }
  let actor: { userId: string; email: string | null }
  try {
    actor = await requirePlatformAdmin()
  } catch {
    return { error: 'Platform admin required' }
  }

  // Refuse to switch into a mode whose secret key isn't configured.
  const target = platformEnvFor(mode)
  if (!target.secretKey) {
    return { error: `Cannot switch to ${mode} mode — STRIPE_SECRET_KEY_${mode.toUpperCase()} is not set in the environment.` }
  }

  const service = createServiceRoleClient()
  await service
    .from('platform_settings')
    .upsert(
      { key: 'platform_stripe_mode', value: mode, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  // Alert the platform team that billing mode changed.
  await sendPlatformAlert(
    'subscription_change',
    `Platform Stripe mode → ${mode.toUpperCase()}`,
    `<div style="font-family:sans-serif;max-width:560px;color:#111;">
       <h2>Platform Stripe mode changed</h2>
       <p>Fieldday subscription billing is now operating in <strong>${mode.toUpperCase()}</strong> mode.</p>
       <p style="color:#6b7280;font-size:13px;">Changed by ${actor.email ?? actor.userId}. ${mode === 'test' ? 'No real charges will be processed while in test mode.' : 'Live charges are now active.'}</p>
     </div>`,
  ).catch(() => {})

  revalidatePath('/super/settings')
  revalidatePath('/', 'layout')
  return { error: null }
}

// ── Global maintenance mode ───────────────────────────────────────────────────

export interface GlobalMaintenanceSettings {
  enabled: boolean
  message: string | null
  until: string | null  // ISO 8601 or null
}

export async function getGlobalMaintenance(): Promise<GlobalMaintenanceSettings> {
  await requirePlatformAdmin()
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
  await requirePlatformAdmin()
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
  await requirePlatformAdmin()
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
  await requirePlatformAdmin()
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
  await requirePlatformAdmin()
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
  await requirePlatformAdmin()
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

export interface PlatformAlerts {
  email: string | null          // recipient — null means all platform admins
  newOrg: boolean
  subscriptionChange: boolean
  trialExpiring: boolean
  billingFailure: boolean
  accountDeletion: boolean
}

export async function getPlatformAlerts(): Promise<PlatformAlerts> {
  await requirePlatformAdmin()
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
  await requirePlatformAdmin()
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

// sendPlatformAlert moved to lib/platform-alerts.ts — it is called from cron
// routes, webhooks, and signup flows (no admin session), so it must not be a
// publicly invokable server action.
