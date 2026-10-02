'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Trophy } from 'lucide-react'

const TABS = [
  { href: '/dashboard', label: 'Dashboard',  Icon: LayoutDashboard },
  { href: '/schedule',  label: 'My Games',   Icon: CalendarDays    },
  { href: '/my-events', label: 'My Events',  Icon: Trophy          },
] as const

export function MobileBottomNavClient() {
  const pathname = usePathname()
  // The tab the player just tapped. The URL only changes once the server has
  // rendered the next page, so without this the bar would keep showing the
  // old tab for that whole wait — the tap would look ignored. Cleared as soon
  // as the route actually changes.
  const [tapped, setTapped] = useState<string | null>(null)
  const [seenPath, setSeenPath] = useState(pathname)
  if (pathname !== seenPath) {
    setSeenPath(pathname)
    setTapped(null)
  }

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(href + '/')
  // Highlight follows the tap immediately; aria-current stays on the page
  // that's actually showing.
  const isHighlighted = (href: string) => (tapped ? tapped === href : isCurrent(href))

  return (
    <nav
      // data-mobile-tab-bar: globals.css lifts the event page's sticky
      // register bar above this bar while both are on screen.
      data-mobile-tab-bar=""
      className="fd-bar-light md:hidden fixed bottom-0 inset-x-0 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobile navigation"
    >
      <div className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = isHighlighted(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setTapped(href)}
              className="press flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px]"
              style={{ color: active ? 'var(--brand-primary)' : '#6b7280' }}
              aria-current={isCurrent(href) ? 'page' : undefined}
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
