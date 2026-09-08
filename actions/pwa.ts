'use server'

import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

export type PwaPlatform = 'ios' | 'android' | 'desktop' | 'other'

/**
 * Install metrics: called once per browser session by PwaRegistrar. Records
 * (org, user, day) with how the app was opened. A standalone launch on any
 * day wins over a tab launch the same day — that day the player provably has
 * it installed. Best-effort, never surfaces to the UI.
 */
export async function logPwaLaunch(input: { standalone: boolean; platform: PwaPlatform }): Promise<void> {
  try {
    const headersList = await headers()
    if (!headersList.get('x-org-id')) return
    const org = await getCurrentOrg(headersList)
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const standalone = input.standalone === true
    const platform: PwaPlatform = (['ios', 'android', 'desktop', 'other'] as const).includes(input.platform) ? input.platform : 'other'
    const day = new Date().toISOString().slice(0, 10)

    const db = createServiceRoleClient()
    const { data: existing } = await db
      .from('pwa_launch_logs')
      .select('standalone, launches')
      .eq('organization_id', org.id).eq('user_id', user.id).eq('day', day)
      .maybeSingle()

    await db.from('pwa_launch_logs').upsert({
      organization_id: org.id,
      user_id: user.id,
      day,
      standalone: standalone || existing?.standalone === true,
      platform,
      launches: (existing?.launches ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id,day' })
  } catch (err) {
    console.warn('[pwa] launch log failed:', err)
  }
}
