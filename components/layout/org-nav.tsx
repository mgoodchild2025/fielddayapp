import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '@/lib/supabase/server'
import { NavUserMenu } from './nav-user-menu'
import { MobileNav } from './mobile-nav'
import { NotificationBell } from './notification-bell'
import type { OrgContext } from '@/lib/tenant'

interface OrgNavProps {
  org: OrgContext
  logoUrl: string | null
}

export async function OrgNav({ org, logoUrl }: OrgNavProps) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userName: string | null = null
  let isAdmin = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let unreadNotifications: { id: string; title: string; body: string | null; created_at: string; data: any }[] = []

  if (user) {
    const [{ data: profile }, { data: member }, { data: notifs }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single(),
      supabase.from('notifications').select('id, title, body, created_at, data')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    userName = profile?.full_name ?? user.email ?? null
    isAdmin = ['org_admin', 'league_admin'].includes(member?.role ?? '')
    unreadNotifications = notifs ?? []
  }

  return (
    <nav
      className="sticky top-0 z-40 border-b"
      style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          {logoUrl ? (
            <Image src={logoUrl} alt={org.name} width={120} height={40} className="object-contain h-9 w-auto" />
          ) : (
            <span className="text-xl font-bold uppercase tracking-wide" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              {org.name}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/events" className="opacity-80 hover:opacity-100 transition-opacity">Events</Link>
          </div>

          {user ? (
            <>
              <NotificationBell initialNotifications={unreadNotifications} />
              <div className="hidden md:block">
                <NavUserMenu userName={userName} isAdmin={isAdmin} />
              </div>
            </>
          ) : (
            <div className="hidden md:block">
              <Link
                href="/login"
                className="px-4 py-1.5 rounded-md font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Sign In
              </Link>
            </div>
          )}

          <MobileNav userName={userName} isAdmin={isAdmin} />
        </div>
      </div>
    </nav>
  )
}
