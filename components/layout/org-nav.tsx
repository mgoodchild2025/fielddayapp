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
  brandBar?: boolean
}

export async function OrgNav({ org, logoUrl, brandBar = true }: OrgNavProps) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userName: string | null = null
  let isAdmin = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let unreadNotifications: { id: string; type: string | null; title: string; body: string | null; created_at: string; data: any }[] = []

  if (user) {
    const [{ data: profile }, { data: member }, { data: notifs }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single(),
      supabase.from('notifications').select('id, type, title, body, created_at, data')
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
    <>
      {/* ── Brand bar — scrolls with the page ──────────────────────────────── */}
      {/* Suppressed on the home page (brandBar=false) — hero handles branding there */}
      {brandBar && (
        <div style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}>
          <div className="max-w-6xl mx-auto px-6 py-4 sm:py-5 flex items-center justify-center sm:justify-start">
            <Link href="/" className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <>
                  {/* Badge: circular white-ring container works for any logo shape */}
                  <div className="w-14 h-14 rounded-full ring-2 ring-white/30 bg-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    <Image
                      src={logoUrl}
                      alt={org.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 object-contain"
                      unoptimized
                    />
                  </div>
                  <span
                    className="text-xl font-bold uppercase tracking-wide truncate"
                    style={{ fontFamily: 'var(--brand-heading-font)' }}
                  >
                    {org.name}
                  </span>
                </>
              ) : (
                <span
                  className="text-3xl sm:text-2xl font-bold uppercase tracking-wide"
                  style={{ fontFamily: 'var(--brand-heading-font)' }}
                >
                  {org.name}
                </span>
              )}
            </Link>
          </div>
        </div>
      )}

      {/* ── Sticky nav bar — stays on screen while scrolling ───────────────── */}
      {/* Slim h-14 bar; org name as text gives context once brand bar scrolls away */}
      <nav
        className="sticky top-0 z-40 border-b border-white/10"
        style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
      >
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">

          {/* Left: org name text — context anchor when brand bar is out of view */}
          <Link
            href="/"
            className="text-sm font-bold uppercase tracking-wide opacity-80 hover:opacity-100 transition-opacity truncate min-w-0 shrink"
            style={{ fontFamily: 'var(--brand-heading-font)' }}
          >
            {org.name}
          </Link>

          {/* Right: desktop nav + notifications + user menu + hamburger */}
          <div className="flex items-center gap-2 shrink-0">
            {user && (
              <div className="hidden md:flex items-center gap-6 text-sm font-medium">
                <Link href="/events" className="opacity-80 hover:opacity-100 transition-opacity">
                  Events
                </Link>
              </div>
            )}

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
    </>
  )
}
