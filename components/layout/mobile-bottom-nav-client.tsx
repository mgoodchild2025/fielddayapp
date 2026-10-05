'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
// Events = a ticket (your registrations); the trophy belongs to Champions.
import { House, CalendarDays, Ticket, CircleUser, LogIn, type LucideIcon } from 'lucide-react'

interface Tab {
  href: string
  label: string
  Icon: LucideIcon
  /** Path prefixes this tab "owns" — it stays lit anywhere under them. */
  match: string[]
}

// Every signed-in page a player reaches from here lights one of these, so the
// bar always answers "where am I?". Events opens My Events (which links out to
// browsing) and stays lit while browsing.
const MEMBER_TABS: Tab[] = [
  { href: '/dashboard', label: 'Home',   Icon: House,        match: ['/dashboard'] },
  { href: '/schedule',  label: 'Games',  Icon: CalendarDays, match: ['/schedule', '/games', '/standings'] },
  { href: '/my-events', label: 'Events', Icon: Ticket,       match: ['/my-events', '/events'] },
  // Team pages, card binders and player cards are "your stuff": Me.
  { href: '/profile',   label: 'Me',     Icon: CircleUser,   match: ['/profile', '/my-teams', '/teams', '/players'] },
]

// Visitors get a slimmer bar on browsing pages; one-off flows (invites, check-in,
// unsubscribe…) carry their own next step, so the bar stays out of the way there.
const VISITOR_HIDDEN = ['/checkin', '/invite', '/join', '/sub-invite', '/organizer-invite', '/unsubscribe', '/goodbye']

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')

// The query string, read without useSearchParams (which would need a Suspense
// boundary on statically rendered pages like the 404). Re-read on each render
// — the bar re-renders on every navigation anyway.
const noSubscribe = () => () => {}
const readSearch = () => window.location.search

export function MobileBottomNavClient({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname()
  const search = useSyncExternalStore(noSubscribe, readSearch, () => '')
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

  if (!signedIn && VISITOR_HIDDEN.some((p) => under(pathname, p))) return null

  const tabs: Tab[] = signedIn
    ? MEMBER_TABS
    : [
        { href: '/events', label: 'Events', Icon: Ticket, match: ['/events'] },
        {
          // Come back to the page they were on after signing in — query
          // included (an event's ?tab=schedule used to be dropped).
          href: pathname && pathname !== '/' ? `/login?redirect=${encodeURIComponent(pathname + search)}` : '/login',
          label: 'Sign in',
          Icon: LogIn,
          match: [],
        },
      ]

  const isCurrent = (tab: Tab) => tab.match.some((p) => under(pathname, p))
  // Highlight follows the tap immediately; aria-current stays on the page
  // that's actually showing.
  const isHighlighted = (tab: Tab) => (tapped ? tapped === tab.href : isCurrent(tab))

  return (
    <nav
      // data-mobile-tab-bar: globals.css lifts the event page's sticky
      // register bar above this bar while both are on screen.
      data-mobile-tab-bar=""
      className="fd-bar-light md:hidden print:hidden fixed bottom-0 inset-x-0 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobile navigation"
    >
      <div className="flex">
        {tabs.map((tab) => {
          const { href, label, Icon } = tab
          const active = isHighlighted(tab)
          return (
            <Link
              key={label}
              href={href}
              onClick={() => setTapped(href)}
              className="press flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px]"
              style={{ color: active ? 'var(--brand-primary-ink, var(--brand-primary))' : '#6b7280' }}
              aria-current={isCurrent(tab) ? 'page' : undefined}
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
