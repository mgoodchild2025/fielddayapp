import { createServerClient } from '@/lib/supabase/server'
import { MobileBottomNavClient } from './mobile-bottom-nav-client'

export async function MobileBottomNav() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return <MobileBottomNavClient />
}
