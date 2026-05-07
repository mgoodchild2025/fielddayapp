'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'

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
