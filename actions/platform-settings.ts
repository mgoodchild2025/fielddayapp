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
