import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { NavUserMenu } from './nav-user-menu'
import { MobileNav } from './mobile-nav'
import { NotificationBell } from './notification-bell'
import { CartNavIcon } from '@/components/shop/cart-nav-icon'
import type { OrgContext } from '@/lib/tenant'
import type { NavLink } from '@/actions/nav-links'

interface OrgNavProps {
  org: OrgContext
  logoUrl: string | null
}

export async function OrgNav({ org, logoUrl }: OrgNavProps) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  let userName: string | null = null
  let isAdmin = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let unreadNotifications: { id: string; type: string | null; title: string; body: string | null; created_at: string; data: any }[] = []

  const [navLinksResult, sectionLayoutResult, ...userResults] = await Promise.all([
    db.from('org_nav_links')
      .select('id, label, link_type, url, open_in_new_tab, sort_order')
      .eq('organization_id', org.id)
      .order('sort_order', { ascending: true }),
    db.from('org_site_content')
      .select('content')
      .eq('organization_id', org.id)
      .eq('section_key', 'section_layout')
      .maybeSingle(),
    ...(user ? [
      db.from('profiles').select('full_name').eq('id', user.id).single(),
      db.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single(),
      db.from('notifications').select('id, type, title, body, created_at, data')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(20),
    ] : []),
  ])

  const customLinks: NavLink[] = (navLinksResult.data ?? []) as NavLink[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sectionItems: { key: string; visible: boolean }[] = (sectionLayoutResult?.data as any)?.content?.sections ?? []
  const photosSection = sectionItems.find((s) => s.key === 'photos')
  const showGallery = photosSection ? photosSection.visible : true  // default visible if not configured

  if (user && userResults.length === 3) {
    const [{ data: profile }, { data: member }, { data: notifs }] = userResults as [
      { data: { full_name: string } | null },
      { data: { role: string } | null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { data: any[] | null },
    ]
    userName = profile?.full_name ?? user.email ?? null
    isAdmin = ['org_admin', 'league_admin'].includes(member?.role ?? '')
    unreadNotifications = notifs ?? []
  }

  return (
    <nav
      className="sticky top-0 z-40 border-b border-white/10"
      style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">

        {/* Left: logo (if uploaded) + org name */}
        <Link href="/" className="flex items-center gap-2.5 min-w-0 shrink">
          {logoUrl && (
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
              <Image
                src={logoUrl}
                alt={org.name}
                width={32}
                height={32}
                className="w-full h-full object-contain"
                unoptimized
              />
            </div>
          )}
          <span
            className="text-sm font-bold uppercase tracking-wide opacity-80 hover:opacity-100 transition-opacity truncate"
            style={{ fontFamily: 'var(--brand-heading-font)' }}
          >
            {org.name}
          </span>
        </Link>

        {/* Right: desktop nav + notifications + user menu + hamburger */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-4 text-sm font-medium flex-wrap">
            {showGallery && (
              <Link href="/gallery" className="opacity-80 hover:opacity-100 transition-opacity">Gallery</Link>
            )}
            {user && (
              <Link href="/events" className="opacity-80 hover:opacity-100 transition-opacity">Events</Link>
            )}
            {customLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target={link.open_in_new_tab || link.link_type === 'document' ? '_blank' : undefined}
                rel={link.open_in_new_tab || link.link_type === 'document' ? 'noopener noreferrer' : undefined}
                className="opacity-80 hover:opacity-100 transition-opacity"
              >
                {link.label}
              </a>
            ))}
          </div>

          {user ? (
            <>
              <div className="hidden md:flex items-center gap-1">
                <CartNavIcon />
                <NotificationBell initialNotifications={unreadNotifications} />
              </div>
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

          {user && (
            <div className="md:hidden flex items-center gap-1">
              <CartNavIcon />
              <NotificationBell initialNotifications={unreadNotifications} />
            </div>
          )}
          <MobileNav userName={userName} userEmail={user?.email ?? null} isAdmin={isAdmin} customLinks={customLinks} showGallery={showGallery} />
        </div>
      </div>
    </nav>
  )
}
