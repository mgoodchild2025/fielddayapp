'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'

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
