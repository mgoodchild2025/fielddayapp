'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Trophy, CreditCard, ShoppingBag, Users,
  ClipboardList, Image, Radio, Mail, Settings, PersonStanding, CalendarDays,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { OrgContext } from '@/lib/tenant'
import { cn } from '@/lib/utils'

interface NavItem { label: string; href: string; icon: LucideIcon }

const orgAdminNav: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard',                    icon: LayoutDashboard },
  { label: 'Calendar',  href: '/admin/calendar',                     icon: CalendarDays },
  { label: 'Events',    href: '/admin/events',                       icon: Trophy },
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
  { label: 'Teams',    href: '/admin/teams',                       icon: Users },
  { label: 'Players',  href: '/admin/players',                     icon: PersonStanding },
  { label: 'Waivers',  href: '/admin/settings/waivers/signatures', icon: ClipboardList },
  { label: 'Payments', href: '/admin/payments',                    icon: CreditCard },
  { label: 'Messages', href: '/admin/messages',                    icon: Mail },
]

function SidebarContent({ org, role, onClose }: { org: OrgContext; role: string; onClose?: () => void }) {
  const pathname = usePathname()
  const navItems = role === 'league_admin' ? leagueAdminNav : orgAdminNav

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
          <button onClick={onClose} className="p-1 opacity-60 hover:opacity-100 transition-opacity lg:hidden">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
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

      <div className="p-4 border-t border-white/10 flex items-center justify-between">
        <Link href="/" onClick={onClose} className="text-xs opacity-50 hover:opacity-80 transition-opacity">
          ← Public site
        </Link>
        <a
          href="https://docs.fielddayapp.ca"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs opacity-50 hover:opacity-80 transition-opacity flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Help
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

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = '' }
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    document.documentElement.style.overflowX = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflowX = ''
    }
  }, [mobileOpen])

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
        <span className="font-bold text-sm" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {org.name} — Admin
        </span>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded opacity-80 hover:opacity-100 transition-opacity"
          aria-label="Open admin menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden print:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 right-0 h-full w-64 z-50 lg:hidden print:hidden transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
      >
        <SidebarContent org={org} role={role} onClose={() => setMobileOpen(false)} />
      </aside>
    </>
  )
}
