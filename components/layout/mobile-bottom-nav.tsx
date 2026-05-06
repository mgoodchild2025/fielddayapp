import { createServerClient } from '@/lib/supabase/server'
import { MobileBottomNavClient } from './mobile-bottom-nav-client'

export async function MobileBottomNav() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: notifs } = await supabase
    .from('notifications')
    .select('id, type, title, body, created_at, data')
    .eq('user_id', user.id)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(20)

  return <MobileBottomNavClient initialNotifications={notifs ?? []} />
}
