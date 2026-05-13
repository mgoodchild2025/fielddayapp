'use server'

import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

export async function markAllNotificationsRead() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  await db
    .from('notifications')
    .update({ read: true })
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('read', false)

  return { error: null }
}

export async function markNotificationRead(notificationId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  await db
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('organization_id', org.id)
    .eq('user_id', user.id)

  return { error: null }
}
