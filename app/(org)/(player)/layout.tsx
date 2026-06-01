import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { getPlayerPendingReconsent } from '@/actions/player-consents'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''

  // Login-time reconsent block — skip on the reconsent page itself to avoid a loop
  if (!pathname.startsWith('/reconsent')) {
    const org = await getCurrentOrg(headersList)
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const pending = await getPlayerPendingReconsent(org.id, user.id)
      if (pending) {
        redirect(`/reconsent?redirect=${encodeURIComponent(pathname || '/dashboard')}`)
      }
    }
  }

  return (
    <>
      {children}
      <MobileBottomNav />
    </>
  )
}
