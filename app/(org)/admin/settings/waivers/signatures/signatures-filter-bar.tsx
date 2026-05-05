'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

interface Props {
  events: string[]
  waivers: string[]
  currentQ: string
  currentEvent: string
  currentWaiver: string
  total: number
  filtered: number
}

export function SignaturesFilterBar({
  events,
  waivers,
  currentQ,
  currentEvent,
  currentWaiver,
  total,
  filtered,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`)
      })
    },
    [router, pathname, searchParams],
  )

  const hasFilters = !!(currentQ || currentEvent || currentWaiver)

  function clearAll() {
    startTransition(() => {
      router.replace(pathname)
    })
  }

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="search"
            defaultValue={currentQ}
            placeholder="Search player name, email, or signature…"
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
            style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>

        {/* Event filter */}
        {events.length > 1 && (
          <select
            value={currentEvent}
            onChange={(e) => update('event', e.target.value)}
            className="border rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-offset-0"
            style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
          >
            <option value="">All events</option>
            {events.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        )}

        {/* Waiver filter */}
        {waivers.length > 1 && (
          <select
            value={currentWaiver}
            onChange={(e) => update('waiver', e.target.value)}
            className="border rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-offset-0"
            style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
          >
            <option value="">All waivers</option>
            {waivers.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={clearAll}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-800 border rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Result count */}
      {hasFilters && (
        <p className="text-xs text-gray-400">
          Showing {filtered} of {total} signature{total !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
