'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { OrgContext } from '@/lib/tenant'
import { cn } from '@/lib/utils'

interface AdminSidebarProps {
  org: OrgContext
  role: string
}

const orgAdminNav = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: '▣' },
  { label: 'Events', href: '/admin/events', icon: '🏆' },
  { label: 'Payments', href: '/admin/payments', icon: '💳' },
  { label: 'Teams', href: '/admin/teams', icon: '👥' },
  { label: 'Players', href: '/admin/players', icon: '🏃' },
  { label: 'Messages', href: '/admin/messages', icon: '✉️' },
  { label: 'Admins', href: '/admin/users', icon: '🔑' },
  { label: 'Settings', href: '/admin/settings', icon: '⚙️' },
]

const leagueAdminNav = [
  { label: 'Events', href: '/admin/events', icon: '🏆' },
  { label: 'Teams', href: '/admin/teams', icon: '👥' },
  { label: 'Players', href: '/admin/players', icon: '🏃' },
  { label: 'Payments', href: '/admin/payments', icon: '💳' },
  { label: 'Messages', href: '/admin/messages', icon: '✉️' },
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

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
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
              <span className="text-base leading-none">{item.icon}</span>
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

export function AdminSidebar({ org, role }: AdminSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Prevent body scroll + iOS right-edge viewport expansion when open
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
      {/* Desktop sidebar — sticky so it stays in view on long pages */}
      <aside
        className="hidden lg:flex w-56 shrink-0 flex-col sticky top-0 h-screen overflow-y-auto"
        style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
      >
        <SidebarContent org={org} role={role} />
      </aside>

      {/* Mobile top bar */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 border-b border-white/10"
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

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer — slides from right */}
      <aside
        className={cn(
          'fixed top-0 right-0 h-full w-64 z-50 lg:hidden transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
      >
        <SidebarContent org={org} role={role} onClose={() => setMobileOpen(false)} />
      </aside>
    </>
  )
}
