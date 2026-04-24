'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { OrgContext } from '@/lib/tenant'
import { cn } from '@/lib/utils'

interface AdminSidebarProps {
  org: OrgContext
  role: string
}

const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: '▣' },
  { label: 'Leagues', href: '/admin/leagues', icon: '🏆' },
  { label: 'Payments', href: '/admin/payments', icon: '💳' },
  { label: 'Members', href: '/admin/users', icon: '👥' },
  { label: 'Messages', href: '/admin/messages', icon: '✉️' },
  { label: 'Settings', href: '/admin/settings', icon: '⚙️' },
]

export function AdminSidebar({ org, role }: AdminSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="w-56 shrink-0 flex flex-col min-h-screen" style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}>
      <div className="p-5 border-b border-white/10">
        <p className="text-xs uppercase tracking-widest opacity-50 mb-1">Admin</p>
        <p className="font-bold text-sm leading-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>{org.name}</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
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

      <div className="p-4 border-t border-white/10">
        <Link href="/" className="text-xs opacity-50 hover:opacity-80 transition-opacity">
          ← Public site
        </Link>
      </div>
    </aside>
  )
}
