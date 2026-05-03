'use client'

import { useState } from 'react'
import Link from 'next/link'

export interface EventItem {
  id: string
  name: string
  slug: string
  status: string
  event_type: string | null
  sport: string | null
  price_cents: number
  currency: string
  season_start_date: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSport(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPrice(cents: number, currency: string) {
  return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(0)} ${currency.toUpperCase()}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatYear(iso: string) {
  return new Date(iso).getFullYear()
}

// ── Featured card ─────────────────────────────────────────────────────────────

function FeaturedCard({ event, isOrgAdmin }: { event: EventItem; isOrgAdmin: boolean }) {
  const isOpen   = event.status === 'registration_open'
  const isActive = event.status === 'active'

  const href = isOpen
    ? `/events/${event.slug}`
    : `/events/${event.slug}?tab=schedule`

  const ctaLabel  = isOpen   ? 'Register →'       : 'View Schedule →'
  const statusLabel = isOpen ? 'Open for Registration' : 'In Season'

  return (
    <Link
      href={href}
      className="group flex flex-col bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Coloured top accent bar */}
      <div
        className="h-1.5 w-full shrink-0"
        style={{ backgroundColor: isOpen ? '#22c55e' : 'var(--brand-primary)' }}
      />

      <div className="flex flex-col flex-1 p-5 gap-4">
        {/* Top row: status badge + sport */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
            isOpen ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-green-500' : 'bg-blue-500'}`} />
            {statusLabel}
          </span>
          {event.sport && (
            <span className="text-xs text-gray-400 font-medium">
              {formatSport(event.sport)}
            </span>
          )}
        </div>

        {/* Event name */}
        <div>
          <h2
            className="text-xl font-bold text-gray-900 group-hover:opacity-80 transition-opacity leading-snug"
            style={{ fontFamily: 'var(--brand-heading-font)' }}
          >
            {event.name}
          </h2>
          {event.season_start_date && (
            <p className="text-sm text-gray-400 mt-1">
              {isActive ? 'Started' : 'Starts'} {formatDate(event.season_start_date)}
            </p>
          )}
        </div>

        {/* Bottom row: price + CTA */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
          {(isOpen || isOrgAdmin) ? (
            <span className="text-base font-bold" style={{ color: 'var(--brand-primary)' }}>
              {formatPrice(event.price_cents, event.currency)}
            </span>
          ) : (
            <span />
          )}
          <span
            className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity group-hover:opacity-90"
            style={{ backgroundColor: isOpen ? '#22c55e' : 'var(--brand-primary)' }}
          >
            {ctaLabel}
          </span>
        </div>
      </div>
    </Link>
  )
}

// ── Past events row ───────────────────────────────────────────────────────────

function PastRow({ event }: { event: EventItem }) {
  return (
    <Link
      href={`/events/${event.slug}?tab=standings`}
      className="flex items-center justify-between gap-3 py-3 px-1 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-1 px-1 rounded transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-medium text-gray-700 truncate">{event.name}</span>
        {event.sport && (
          <span className="hidden sm:inline text-xs text-gray-400 shrink-0">{formatSport(event.sport)}</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {event.season_start_date && (
          <span className="text-xs text-gray-400">{formatYear(event.season_start_date)}</span>
        )}
        <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PAST_PREVIEW = 5

export function EventsFilter({ events, isOrgAdmin = false }: { events: EventItem[]; isOrgAdmin?: boolean }) {
  const [showAllPast, setShowAllPast] = useState(false)

  const featured = events.filter((e) => e.status === 'registration_open' || e.status === 'active')
  const past     = events.filter((e) => e.status === 'completed' || e.status === 'archived')

  const visiblePast = showAllPast ? past : past.slice(0, PAST_PREVIEW)

  if (events.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        No events available yet.
      </div>
    )
  }

  return (
    <div className="space-y-10">

      {/* ── Featured: open + in-season ──────────────────────────────────────── */}
      {featured.length > 0 && (
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featured.map((e) => (
              <FeaturedCard key={e.id} event={e} isOrgAdmin={isOrgAdmin} />
            ))}
          </div>
        </section>
      )}

      {/* ── Past events ─────────────────────────────────────────────────────── */}
      {past.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Past Events</h2>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="bg-white rounded-xl border px-4">
            {visiblePast.map((e) => (
              <PastRow key={e.id} event={e} />
            ))}
          </div>

          {past.length > PAST_PREVIEW && (
            <button
              onClick={() => setShowAllPast((v) => !v)}
              className="mt-3 w-full text-sm font-medium text-center py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
            >
              {showAllPast
                ? 'Show fewer'
                : `Show ${past.length - PAST_PREVIEW} more past event${past.length - PAST_PREVIEW !== 1 ? 's' : ''}`}
            </button>
          )}
        </section>
      )}

      {/* Edge case: only past events exist, no featured */}
      {featured.length === 0 && past.length > 0 && (
        <p className="text-sm text-gray-400 -mt-6">No events currently open for registration.</p>
      )}

    </div>
  )
}
