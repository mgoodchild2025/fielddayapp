'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

type EventItem = { id: string; name: string; slug: string }

export function ViewEventsDropdown({
  inSeason,
  completed,
}: {
  inSeason: EventItem[]
  completed: EventItem[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const hasAny = inSeason.length > 0 || completed.length > 0

  if (!hasAny) return null

  return (
    <div ref={ref} className="relative inline-block mt-8">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-8 py-3 rounded-md font-semibold text-lg text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--brand-primary)', fontFamily: 'var(--brand-heading-font)' }}
      >
        View Events
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white rounded-xl shadow-2xl border text-left z-50 overflow-hidden">
          {inSeason.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                In Season
              </p>
              {inSeason.map((e) => (
                <Link
                  key={e.id}
                  href={`/events/${e.slug}?tab=schedule`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  <span className="text-sm font-medium text-gray-800 truncate">{e.name}</span>
                </Link>
              ))}
            </div>
          )}

          {inSeason.length > 0 && completed.length > 0 && (
            <hr className="my-1 border-gray-100" />
          )}

          {completed.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Past Events
              </p>
              {completed.map((e) => (
                <Link
                  key={e.id}
                  href={`/events/${e.slug}?tab=standings`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                  <span className="text-sm text-gray-600 truncate">{e.name}</span>
                </Link>
              ))}
            </div>
          )}

          <div className="px-4 py-3 border-t bg-gray-50">
            <Link
              href="/events"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Browse all events →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
