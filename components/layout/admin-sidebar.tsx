'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Trophy, CreditCard, ShoppingBag, Users,
  ClipboardList, Image, Radio, Mail, Settings, PersonStanding, CalendarDays,
  TrendingUp, Timer, ArrowLeft, CircleHelp, ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { OrgContext } from '@/lib/tenant'
import { cn } from '@/lib/utils'
import { Overlay } from '@/components/ui/overlay'
import { OPEN_ADMIN_MENU } from '@/lib/nav-events'

interface NavItem { label: string; href: string; icon: LucideIcon }

const orgAdminNav: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard',                    icon: LayoutDashboard },
  { label: 'Calendar',  href: '/admin/calendar',                     icon: CalendarDays },
  { label: 'Events',    href: '/admin/events',                       icon: Trophy },
  { label: 'Courtside', href: '/admin/courtside',                    icon: Timer },
  { label: 'Payments',  href: '/admin/payments',                     icon: CreditCard },
  { label: 'Finances',  href: '/admin/finances',                     icon: TrendingUp },
  { label: 'Shop',      href: '/admin/shop',                         icon: ShoppingBag },
  { label: 'Teams',     href: '/admin/teams',                        icon: Users },
  { label: 'Players',   href: '/admin/players',                      icon: PersonStanding },
  { label: 'Waivers',   href: '/admin/settings/waivers/signatures',  icon: ClipboardList },
  { label: 'Gallery',   href: '/admin/gallery',                      icon: Image },
  { label: 'Live',      href: '/admin/live',                         icon: Radio },
  { label: 'Messages',  href: '/admin/messages',                     icon: Mail },
  { label: 'Settings',  href: '/admin/settings',                     icon: Settings },
]

const leagueAdminNav: NavItem[] = [
  { label: 'Events',   href: '/admin/events',                      icon: Trophy },
  { label: 'Courtside', href: '/admin/courtside',                   icon: Timer },
  { label: 'Teams',    href: '/admin/teams',                       icon: Users },
  { label: 'Players',  href: '/admin/players',                     icon: PersonStanding },
  { label: 'Waivers',  href: '/admin/settings/waivers/signatures', icon: ClipboardList },
  { label: 'Payments', href: '/admin/payments',                    icon: CreditCard },
  { label: 'Messages', href: '/admin/messages',                    icon: Mail },
]

function SidebarContent({ org, role, onClose }: { org: OrgContext; role: string; onClose?: () => void }) {
  const pathname = usePathname()
  const navItems = role === 'league_admin' ? leagueAdminNav : orgAdminNav
  // One item is current: the longest href the path sits under. (Waivers lives
  // at /admin/settings/waivers/…, so a plain prefix test lit Settings too.)
  const currentHref = navItems
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    .reduce<string | null>((best, item) => (!best || item.href.length > best.length ? item.href : best), null)

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-white/10 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest opacity-50 mb-1">
            {role === 'league_admin' ? 'League Admin' : 'Admin'}
          </p>
          <p className="font-bold text-sm leading-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>{org.name}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 -mr-1 opacity-60 hover:opacity-100 transition-opacity lg:hidden" aria-label="Close menu">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-0.5">
        {navItems.map((item) => {
          const active = item.href === currentHref
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors',
                active ? 'bg-white/15 font-semibold' : 'opacity-70 hover:opacity-100 hover:bg-white/10'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Two full rows, not two small links side by side: they were easy to
          mis-tap on a phone. */}
      <div className="p-2 border-t border-white/10 space-y-1">
        <Link href="/" onClick={onClose} className="press flex items-center gap-3 min-h-11 px-3 rounded-md text-sm opacity-80 hover:opacity-100 hover:bg-white/10">
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          Public site
        </Link>
        <a
          href="https://docs.fielddayapp.ca"
          target="_blank"
          rel="noopener noreferrer"
          className="press flex items-center gap-3 min-h-11 px-3 rounded-md text-sm opacity-80 hover:opacity-100 hover:bg-white/10"
        >
          <CircleHelp className="w-4 h-4 shrink-0" aria-hidden="true" />
          Help and guides
          <ExternalLink className="w-3.5 h-3.5 ml-auto opacity-60" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  )
}

interface AdminSidebarProps { org: OrgContext; role: string }

export function AdminSidebar({ org, role }: AdminSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => { setMobileOpen(false) }, [pathname])

  // The phone tab bar's Admin button opens this drawer.
  useEffect(() => {
    const openMenu = () => setMobileOpen(true)
    window.addEventListener(OPEN_ADMIN_MENU, openMenu)
    return () => window.removeEventListener(OPEN_ADMIN_MENU, openMenu)
  }, [])

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = '' }
  }, [])

  return (
    <>
      <aside
        className="hidden lg:flex print:hidden w-56 shrink-0 flex-col h-full overflow-y-auto"
        style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
      >
        <SidebarContent org={org} role={role} />
      </aside>

      <div
        className="lg:hidden print:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 border-b border-white/10"
        style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
      >
        <span className="font-bold text-sm truncate min-w-0" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {org.name} — Admin
        </span>
        <div className="flex items-center gap-1 shrink-0">
        {/* Game night is one tap from any admin page on a phone. */}
        <Link
          href="/admin/courtside"
          aria-current={pathname?.startsWith('/admin/courtside') ? 'page' : undefined}
          className="press inline-flex items-center gap-1 min-h-10 px-3 rounded-full text-sm font-semibold bg-white/15 hover:bg-white/25 aria-[current=page]:bg-white/30"
        >
          ⏱ Courtside
        </Link>
        <button
          // Hidden on phones, where the tab bar's Admin button opens the menu.
          data-top-mobile-nav=""
          onClick={() => setMobileOpen(true)}
          className="press inline-flex items-center justify-center min-h-11 min-w-11 rounded opacity-80 hover:opacity-100"
          aria-label="Open admin menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        </div>
      </div>

      <Overlay
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        variant="drawer"
        label="Admin menu"
        className="lg:hidden print:hidden"
        panelClassName="w-64"
        panelStyle={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
      >
        <SidebarContent org={org} role={role} onClose={() => setMobileOpen(false)} />
      </Overlay>
    </>
  )
}
