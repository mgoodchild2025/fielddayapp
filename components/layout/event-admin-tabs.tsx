'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

function tabs(id: string, eventType: string, pickupJoinPolicy: string) {
  const base = [
    { label: 'Overview', href: `/admin/events/${id}` },
    { label: 'Registrations', href: `/admin/events/${id}/registrations` },
  ]

  if (eventType === 'pickup') {
    const t = [...base, { label: 'Sessions', href: `/admin/events/${id}/sessions` }]
    if (pickupJoinPolicy === 'private') {
      t.push({ label: 'Invites', href: `/admin/events/${id}/invites` })
    }
    return t
  }

  if (eventType === 'drop_in') {
    const t = [...base, { label: 'Sessions', href: `/admin/events/${id}/sessions` }]
    if (pickupJoinPolicy === 'private') {
      t.push({ label: 'Invites', href: `/admin/events/${id}/invites` })
    }
    return t
  }

  if (eventType === 'league') {
    return [
      ...base,
      { label: 'Divisions', href: `/admin/events/${id}/divisions` },
      { label: 'Teams', href: `/admin/events/${id}/teams` },
      { label: 'Schedule', href: `/admin/events/${id}/schedule` },
      { label: 'Stats', href: `/admin/events/${id}/stats` },
      { label: 'Bracket', href: `/admin/events/${id}/bracket` },
      { label: 'Check-in', href: `/admin/events/${id}/checkin` },
    ]
  }

  if (eventType === 'tournament') {
    return [
      ...base,
      { label: 'Pools', href: `/admin/events/${id}/pools` },
      { label: 'Teams', href: `/admin/events/${id}/teams` },
      { label: 'Schedule', href: `/admin/events/${id}/schedule` },
      { label: 'Stats', href: `/admin/events/${id}/stats` },
      { label: 'Bracket', href: `/admin/events/${id}/bracket` },
      { label: 'Check-in', href: `/admin/events/${id}/checkin` },
    ]
  }

  // fallback
  return [
    ...base,
    { label: 'Teams', href: `/admin/events/${id}/teams` },
    { label: 'Schedule', href: `/admin/events/${id}/schedule` },
  ]
}

export function EventAdminTabs({ leagueId, eventType, pickupJoinPolicy = 'public' }: { leagueId: string; eventType: string; pickupJoinPolicy?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const tabList = tabs(leagueId, eventType, pickupJoinPolicy)

  function activeHref() {
    // Find the most specific matching tab (longest href that matches)
    return tabList.reduce<string | null>((best, tab) => {
      const isActive =
        tab.href === `/admin/events/${leagueId}`
          ? pathname === tab.href
          : pathname.startsWith(tab.href)
      if (!isActive) return best
      if (!best || tab.href.length > best.length) return tab.href
      return best
    }, null) ?? tabList[0].href
  }

  return (
    <>
      {/* Mobile: full-width select dropdown */}
      <div className="md:hidden mb-6 relative">
        <select
          value={activeHref()}
          onChange={(e) => router.push(e.target.value)}
          className="w-full appearance-none border rounded-lg px-3 py-2.5 pr-8 text-sm font-medium bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-0"
          style={{ focusRingColor: 'var(--brand-primary)' } as React.CSSProperties}
        >
          {tabList.map((tab) => (
            <option key={tab.href} value={tab.href}>{tab.label}</option>
          ))}
        </select>
        {/* Chevron icon */}
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Desktop: tab bar */}
      <div className="hidden md:flex gap-0 border-b mb-6 overflow-x-auto scrollbar-none -mx-1 px-1">
        {tabList.map((tab) => {
          const isActive =
            tab.href === `/admin/events/${leagueId}`
              ? pathname === tab.href
              : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </>
  )
}
