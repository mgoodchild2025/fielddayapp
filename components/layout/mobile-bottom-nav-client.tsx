'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
// Events = a ticket (your registrations); the trophy belongs to Champions.
import { House, Ticket, CircleUser, LogIn, Menu, Bell, type LucideIcon } from 'lucide-react'
import { OPEN_ADMIN_MENU, OPEN_ALERTS, OPEN_SITE_MENU, openFromTabBar, unreadStore } from '@/lib/nav-events'

interface Tab {
  href: string
  label: string
  Icon: LucideIcon
  /** Path prefixes this tab "owns" — it stays lit anywhere under them. */
  match: string[]
}

// Games left the bar for Menu (its pages — schedule, standings, games — light
// no tab; they're a tap away from Home and the menu). Events opens My Events
// and stays lit while browsing. Me owns "your stuff": teams, cards, profile.
const HOME: Tab = { href: '/dashboard', label: 'Home', Icon: House, match: ['/dashboard'] }
const EVENTS: Tab = { href: '/my-events', label: 'Events', Icon: Ticket, match: ['/my-events', '/events'] }
const ME: Tab = { href: '/profile', label: 'Me', Icon: CircleUser, match: ['/profile', '/my-teams', '/teams', '/players'] }

// Visitors get a slimmer bar on browsing pages; one-off flows (invites, check-in,
// unsubscribe…) carry their own next step, so the bar stays out of the way there.
const VISITOR_HIDDEN = ['/checkin', '/invite', '/join', '/sub-invite', '/organizer-invite', '/unsubscribe', '/goodbye']

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')

// The query string, read without useSearchParams (which would need a Suspense
// boundary on statically rendered pages like the 404). Re-read on each render
// — the bar re-renders on every navigation anyway.
const noSubscribe = () => () => {}
const readSearch = () => window.location.search

/**
 * The phone tab bar (below md). Members: Home · Events · Alerts · Me · Menu,
 * with Alerts raised in the centre and Menu under the right thumb. Visitors:
 * Events · Sign in · Menu. In the admin panel the right slot opens the admin
 * menu instead of the site drawer. Menu and Alerts open UI owned elsewhere
 * (lib/nav-events); globals.css hides the top nav's own bell and hamburger
 * on any page that shows this bar.
 */
export function MobileBottomNavClient({ signedIn, area = 'site' }: { signedIn: boolean; area?: 'site' | 'admin' }) {
  const pathname = usePathname()
  const search = useSyncExternalStore(noSubscribe, readSearch, () => '')
  const unread = useSyncExternalStore(unreadStore.subscribe, unreadStore.get, () => 0)
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

  const isCurrent = (tab: Tab) => tab.match.some((p) => under(pathname, p))
  // Highlight follows the tap immediately; aria-current stays on the page
  // that's actually showing.
  const isHighlighted = (tab: Tab) => (tapped ? tapped === tab.href : isCurrent(tab))
  const inAdmin = area === 'admin'

  const tabLink = (tab: Tab) => {
    const active = isHighlighted(tab)
    return (
      <Link
        key={tab.label}
        href={tab.href}
        onClick={() => setTapped(tab.href)}
        className="press flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px]"
        style={{ color: active ? 'var(--brand-primary-ink, var(--brand-primary))' : '#6b7280' }}
        aria-current={isCurrent(tab) ? 'page' : undefined}
      >
        <tab.Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.75} />
        <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
      </Link>
    )
  }

  const menuButton = (
    <button
      key="menu"
      type="button"
      onClick={() => openFromTabBar(inAdmin ? OPEN_ADMIN_MENU : OPEN_SITE_MENU)}
      className="press flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px]"
      style={{ color: inAdmin ? 'var(--brand-primary-ink, var(--brand-primary))' : '#6b7280' }}
      aria-label={inAdmin ? 'Open admin menu' : 'Open menu'}
    >
      <Menu className="w-5 h-5" strokeWidth={inAdmin ? 2.5 : 1.75} />
      <span className="text-[10px] font-medium leading-tight">{inAdmin ? 'Admin' : 'Menu'}</span>
    </button>
  )

  // Raised centre button: a white circle poking ~28px above the bar, lifted by
  // its shadow (no brand fill — it shouldn't shout; a transparent bell was
  // tried and looked worse). Not a "current page" tab.
  const alertsButton = (
    <div key="alerts" className="flex-1 flex flex-col items-center justify-end pb-2 min-h-[56px]">
      <button
        type="button"
        onClick={() => openFromTabBar(OPEN_ALERTS)}
        className="press relative -mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white text-gray-700 shadow-md ring-1 ring-black/5"
        aria-label={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}
      >
        <Bell className="w-6 h-6" strokeWidth={2.25} aria-hidden="true" />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold leading-5 text-center border-2 border-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <span className="text-[10px] font-medium leading-tight text-gray-500 mt-0.5" aria-hidden="true">Alerts</span>
    </div>
  )

  const items = signedIn
    ? [tabLink(HOME), tabLink(EVENTS), alertsButton, tabLink(ME), menuButton]
    : [
        tabLink({ href: '/events', label: 'Events', Icon: Ticket, match: ['/events'] }),
        tabLink({
          // Come back to the page they were on after signing in — query
          // included (an event's ?tab=schedule used to be dropped).
          href: pathname && pathname !== '/' ? `/login?redirect=${encodeURIComponent(pathname + search)}` : '/login',
          label: 'Sign in',
          Icon: LogIn,
          match: [],
        }),
        menuButton,
      ]

  return (
    <nav
      // data-mobile-tab-bar: globals.css lifts bottom-pinned bars above it and
      // hides the top nav's bell + hamburger while it's on the page.
      data-mobile-tab-bar=""
      className="fd-bar-light md:hidden print:hidden fixed bottom-0 inset-x-0 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-end">{items}</div>
    </nav>
  )
}
