'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Tab = { id: string; label: string }

/**
 * Event page tabs. Each tab is a ?tab= link that waits on the server, so on
 * tap the tab lights at once (and, while the next tab loads, globals.css dims
 * the current content via [data-event-tabs][data-pending] → [data-tab-panel])
 * — without it a tap looked ignored until the server answered. Cleared as soon
 * as the new tab arrives. Two looks: underline row (before the season) and
 * pills (in season / completed).
 *
 * Scroll: switching tabs must not throw you back to the top of the page (a
 * Link's default navigation scroll did, so every tab change felt like a full
 * reload). Links use scroll={false}; if you were scrolled into the content,
 * the new tab lands with the bar stuck at the top and its content right under
 * it; if the event header was still on screen, nothing moves.
 */
function useTappedTab(activeTab: string) {
  const [tapped, setTapped] = useState<string | null>(null)
  const [seen, setSeen] = useState(activeTab)
  if (activeTab !== seen) {
    setSeen(activeTab)
    setTapped(null)
  }
  const shown = tapped ?? activeTab

  // `sentinel` marks where the sticky bar sits in the page flow; the bar's
  // computed `top` is where it sticks. Their difference is the scroll offset at
  // which the bar is exactly stuck.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<number | null>(null)

  const tap = (id: string) => {
    setTapped(id)
    const sentinel = sentinelRef.current
    const bar = barRef.current
    if (!sentinel || !bar) return
    const stickyTop = parseFloat(getComputedStyle(bar).top) || 0
    const pinY = sentinel.getBoundingClientRect().top + window.scrollY - stickyTop
    pinRef.current = window.scrollY > pinY ? pinY : null
  }

  // The new tab has rendered: put the bar back where it was stuck.
  useLayoutEffect(() => {
    if (pinRef.current === null) return
    window.scrollTo({ top: pinRef.current, behavior: 'instant' })
    pinRef.current = null
  }, [activeTab])

  return { shown, pending: tapped !== null && tapped !== activeTab, tap, sentinelRef, barRef }
}

export function EventTabNav({ slug, activeTab, tabs }: { slug: string; activeTab: string; tabs: Tab[] }) {
  const { shown, pending, tap, sentinelRef, barRef } = useTappedTab(activeTab)
  return (
    <>
    <div ref={sentinelRef} aria-hidden="true" />
    <div ref={barRef} data-event-tabs="" data-pending={pending ? '' : undefined} className="border-b sticky top-14 z-30 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 relative">
        {/* Right-edge fade — visible on mobile only, hints that tabs are scrollable */}
        <div className="pointer-events-none absolute right-4 sm:right-6 inset-y-0 w-10 bg-gradient-to-l from-white to-transparent z-10 sm:hidden" />
        <nav aria-label="Event sections" className="flex gap-0 -mb-px overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((tab) => {
            const lit = shown === tab.id
            return (
              <Link
                key={tab.id}
                href={`/events/${slug}?tab=${tab.id}`}
                scroll={false}
                onClick={() => tap(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`relative shrink-0 px-3.5 sm:px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  lit ? 'text-brand-ink' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {tab.label}
                {/* Underline grows from the centre of the tapped tab (200ms). */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-2 sm:inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-primary transition-transform duration-200 ease-snap ${
                    lit ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
    </>
  )
}

export function EventTabPills({ slug, activeTab, tabs }: { slug: string; activeTab: string; tabs: Tab[] }) {
  const { shown, pending, tap, sentinelRef, barRef } = useTappedTab(activeTab)
  // Keep the current pill in view in the scrolling row (horizontal only — never
  // scroll the page).
  const pillsRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const row = pillsRef.current
    const active = row?.querySelector<HTMLElement>('[data-active]')
    if (!row || !active || row.scrollWidth <= row.clientWidth) return
    const left = active.offsetLeft - 16
    const right = active.offsetLeft + active.offsetWidth + 16 - row.clientWidth
    if (row.scrollLeft > left) row.scrollLeft = left
    else if (row.scrollLeft < right) row.scrollLeft = right
  }, [shown])
  return (
    <>
    <div ref={sentinelRef} aria-hidden="true" />
    <div ref={barRef} data-event-tabs="" data-pending={pending ? '' : undefined} className="border-b sticky top-14 z-30 bg-white shadow-sm">
      <div className="max-w-3xl mx-auto sm:px-6 py-3 relative">
        {/* Phones: one scrolling row. Wrapped onto two rows, the sticky bar
            plus nav plus tab bar took over a quarter of the screen. */}
        <div aria-hidden="true" className="pointer-events-none absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-white to-transparent z-10 sm:hidden" />
        <nav ref={pillsRef} aria-label="Event sections" className="flex gap-2 overflow-x-auto px-4 sm:px-0 sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((tab) => {
            const lit = shown === tab.id
            return (
              <Link
                key={tab.id}
                href={`/events/${slug}?tab=${tab.id}`}
                scroll={false}
                onClick={() => tap(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                data-active={lit ? '' : undefined}
                className={`press shrink-0 min-h-10 inline-flex items-center px-4 rounded-full text-sm font-semibold whitespace-nowrap ${
                  lit ? 'bg-brand-primary text-on-brand' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
    </>
  )
}
