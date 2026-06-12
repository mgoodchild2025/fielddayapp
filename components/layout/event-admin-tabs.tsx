'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
    t.push({ label: 'Check-in', href: `/admin/events/${id}/checkin` })
    t.push({ label: 'Merchandise', href: `/admin/events/${id}/merchandise` })
    t.push({ label: 'Sponsors', href: `/admin/events/${id}/sponsors` })
    return t
  }

  if (eventType === 'drop_in') {
    const t = [...base, { label: 'Sessions', href: `/admin/events/${id}/sessions` }]
    if (pickupJoinPolicy === 'private') {
      t.push({ label: 'Invites', href: `/admin/events/${id}/invites` })
    }
    t.push({ label: 'Check-in', href: `/admin/events/${id}/checkin` })
    t.push({ label: 'Merchandise', href: `/admin/events/${id}/merchandise` })
    t.push({ label: 'Sponsors', href: `/admin/events/${id}/sponsors` })
    return t
  }

  if (eventType === 'league') {
    return [
      ...base,
      { label: 'Divisions', href: `/admin/events/${id}/divisions` },
      { label: 'Pools', href: `/admin/events/${id}/pools` },
      { label: 'Teams', href: `/admin/events/${id}/teams` },
      { label: 'Schedule', href: `/admin/events/${id}/schedule` },
      { label: 'Standings', href: `/admin/events/${id}/standings` },
      { label: 'Stats', href: `/admin/events/${id}/stats` },
      { label: 'Bracket', href: `/admin/events/${id}/bracket` },
      { label: 'Check-in', href: `/admin/events/${id}/checkin` },
      { label: 'Merchandise', href: `/admin/events/${id}/merchandise` },
      { label: 'Sponsors', href: `/admin/events/${id}/sponsors` },
      { label: 'Display', href: `/admin/events/${id}/display` },
    ]
  }

  if (eventType === 'tournament') {
    return [
      ...base,
      { label: 'Pools', href: `/admin/events/${id}/pools` },
      { label: 'Teams', href: `/admin/events/${id}/teams` },
      { label: 'Schedule', href: `/admin/events/${id}/schedule` },
      { label: 'Standings', href: `/admin/events/${id}/standings` },
      { label: 'Stats', href: `/admin/events/${id}/stats` },
      { label: 'Bracket', href: `/admin/events/${id}/bracket` },
      { label: 'Check-in', href: `/admin/events/${id}/checkin` },
      { label: 'Merchandise', href: `/admin/events/${id}/merchandise` },
      { label: 'Sponsors', href: `/admin/events/${id}/sponsors` },
      { label: 'Display', href: `/admin/events/${id}/display` },
    ]
  }

  // fallback
  return [
    ...base,
    { label: 'Teams', href: `/admin/events/${id}/teams` },
    { label: 'Schedule', href: `/admin/events/${id}/schedule` },
    { label: 'Merchandise', href: `/admin/events/${id}/merchandise` },
  ]
}

export function EventAdminTabs({ leagueId, eventType, pickupJoinPolicy = 'public', hasFinances = false }: { leagueId: string; eventType: string; pickupJoinPolicy?: string; hasFinances?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const tabList = tabs(leagueId, eventType, pickupJoinPolicy)
  if (hasFinances) {
    tabList.push({ label: 'Finances', href: `/admin/events/${leagueId}/finances` })
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    el?.addEventListener('scroll', checkScroll, { passive: true })
    const ro = new ResizeObserver(checkScroll)
    if (el) ro.observe(el)
    return () => {
      el?.removeEventListener('scroll', checkScroll)
      ro.disconnect()
    }
  }, [checkScroll])

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

      {/* Desktop: scrollable tab bar with fade + arrow affordances */}
      <div className="hidden md:block relative mb-6">
        {/* Left fade + arrow */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 z-10 flex items-end pb-px pointer-events-none">
            <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white to-transparent" />
            <button
              onClick={() => scrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
              className="relative z-10 pointer-events-auto p-1 text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Scroll tabs left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab strip */}
        <div
          ref={scrollRef}
          className="flex gap-0 border-b overflow-x-auto scrollbar-none"
          style={{ scrollbarWidth: 'none' }}
        >
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

        {/* Right fade + arrow */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 z-10 flex items-end pb-px pointer-events-none">
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
            <button
              onClick={() => scrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
              className="relative z-10 pointer-events-auto p-1 text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Scroll tabs right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
