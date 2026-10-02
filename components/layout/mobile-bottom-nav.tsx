import { createServerClient } from '@/lib/supabase/server'
import { MobileBottomNavClient } from './mobile-bottom-nav-client'

// Members get the full bar; visitors a slim one (Events · Sign in).
export async function MobileBottomNav() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return <MobileBottomNavClient signedIn={!!user} />
}
