'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Trophy, Users, CircleUser } from 'lucide-react'

const TABS = [
  { href: '/schedule',  label: 'My Games',   Icon: CalendarDays },
  { href: '/my-events', label: 'My Events',  Icon: Trophy       },
  { href: '/my-teams',  label: 'My Teams',   Icon: Users        },
  { href: '/profile',   label: 'My Profile', Icon: CircleUser   },
] as const

export function MobileBottomNavClient() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', boxShadow: '0 -1px 8px rgba(0,0,0,0.06)' }}
      aria-label="Mobile navigation"
    >
      <div className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors active:opacity-70"
              style={active ? { color: 'var(--brand-primary)' } : { color: '#9ca3af' }}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.75} />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
