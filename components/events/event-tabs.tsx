'use client'

import { useState } from 'react'
import Link from 'next/link'

type Tab = { id: string; label: string }

/**
 * Event page tabs. Each tab is a ?tab= link that waits on the server, so on
 * tap the tab lights at once (and, while the next tab loads, globals.css dims
 * the current content via [data-event-tabs][data-pending] → [data-tab-panel])
 * — without it a tap looked ignored until the server answered. Cleared as soon
 * as the new tab arrives. Two looks: underline row (before the season) and
 * pills (in season / completed).
 */
function useTappedTab(activeTab: string) {
  const [tapped, setTapped] = useState<string | null>(null)
  const [seen, setSeen] = useState(activeTab)
  if (activeTab !== seen) {
    setSeen(activeTab)
    setTapped(null)
  }
  const shown = tapped ?? activeTab
  return { shown, pending: tapped !== null && tapped !== activeTab, tap: setTapped }
}

export function EventTabNav({ slug, activeTab, tabs }: { slug: string; activeTab: string; tabs: Tab[] }) {
  const { shown, pending, tap } = useTappedTab(activeTab)
  return (
    <div data-event-tabs="" data-pending={pending ? '' : undefined} className="border-b sticky top-14 z-30 bg-white">
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
                onClick={() => tap(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`relative shrink-0 px-3.5 sm:px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  lit ? 'text-brand-primary' : 'text-gray-500 hover:text-gray-800'
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
  )
}

export function EventTabPills({ slug, activeTab, tabs }: { slug: string; activeTab: string; tabs: Tab[] }) {
  const { shown, pending, tap } = useTappedTab(activeTab)
  return (
    <div data-event-tabs="" data-pending={pending ? '' : undefined} className="border-b sticky top-14 z-30 bg-white shadow-sm">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
        <nav aria-label="Event sections" className="flex gap-2 flex-wrap">
          {tabs.map((tab) => {
            const lit = shown === tab.id
            return (
              <Link
                key={tab.id}
                href={`/events/${slug}?tab=${tab.id}`}
                onClick={() => tap(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`press min-h-9 inline-flex items-center px-4 rounded-full text-sm font-semibold whitespace-nowrap ${
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
  )
}
