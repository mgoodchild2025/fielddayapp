'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

type EventItem = { id: string; name: string; slug: string }

interface Props {
  inSeason: EventItem[]
  completed: EventItem[]
}

// ── Shared event list content (rendered in both dropdown and sheet) ────────────

function EventList({ inSeason, completed, onClose }: Props & { onClose: () => void }) {
  return (
    <>
      {inSeason.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            In Season
          </p>
          {inSeason.map((e) => (
            <Link
              key={e.id}
              href={`/events/${e.slug}?tab=schedule`}
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
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
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
              <span className="text-sm text-gray-600 truncate">{e.name}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t bg-gray-50">
        <Link
          href="/events"
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Browse all events →
        </Link>
      </div>
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ViewEventsDropdown({ inSeason, completed }: Props) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Desktop: close on outside click or touch
  useEffect(() => {
    function handle(e: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [])

  // Lock body scroll while mobile sheet is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const hasAny = inSeason.length > 0 || completed.length > 0
  if (!hasAny) return null

  const close = () => setOpen(false)

  return (
    <>
      {/* ── Trigger button + desktop dropdown ───────────────────────── */}
      <div ref={dropdownRef} className="relative inline-block mt-8">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-md font-semibold text-lg text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: 'var(--brand-primary)', fontFamily: 'var(--brand-heading-font)' }}
        >
          View Events
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Desktop dropdown — hidden on mobile */}
        {open && (
          <div className="hidden md:block absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white rounded-xl shadow-2xl border text-left z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            <EventList inSeason={inSeason} completed={completed} onClose={close} />
          </div>
        )}
      </div>

      {/* ── Mobile bottom sheet — hidden on md+ ──────────────────────── */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 animate-in fade-in duration-200"
            onClick={close}
          />

          {/* Sheet */}
          <div className="relative bg-white rounded-t-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1" onClick={close} role="button" aria-label="Close">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="pb-8">
              <EventList inSeason={inSeason} completed={completed} onClose={close} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
