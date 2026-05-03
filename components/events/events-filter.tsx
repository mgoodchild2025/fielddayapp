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

// ── Featured registration card ────────────────────────────────────────────────

function FeaturedCard({ event, isOrgAdmin }: { event: EventItem; isOrgAdmin: boolean }) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group flex flex-col bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="h-1.5 w-full shrink-0 bg-green-500" />
      <div className="flex flex-col flex-1 p-5 gap-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Open for Registration
          </span>
          {event.sport && (
            <span className="text-xs text-gray-400 font-medium">{formatSport(event.sport)}</span>
          )}
        </div>
        <div>
          <h2
            className="text-xl font-bold text-gray-900 leading-snug"
            style={{ fontFamily: 'var(--brand-heading-font)' }}
          >
            {event.name}
          </h2>
          {event.season_start_date && (
            <p className="text-sm text-gray-400 mt-1">
              Starts {formatDate(event.season_start_date)}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          <span className="text-base font-bold text-green-600">
            {formatPrice(event.price_cents, event.currency)}
          </span>
          <span className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white bg-green-500 group-hover:bg-green-600 transition-colors">
            Register →
          </span>
        </div>
      </div>
    </Link>
  )
}

// ── Compact list row ──────────────────────────────────────────────────────────

function EventRow({ event, variant }: { event: EventItem; variant: 'inseason' | 'past' }) {
  const href = variant === 'inseason'
    ? `/events/${event.slug}?tab=schedule`
    : `/events/${event.slug}?tab=standings`

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-4 px-4 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: variant === 'inseason' ? 'var(--brand-primary)' : '#d1d5db' }}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{event.name}</p>
          {event.sport && (
            <p className="text-xs text-gray-400 mt-0.5">{formatSport(event.sport)}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {event.season_start_date && (
          <span className="text-xs text-gray-400 hidden sm:block">
            {variant === 'past' ? formatYear(event.season_start_date) : formatDate(event.season_start_date)}
          </span>
        )}
        <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">
        {label}
      </h2>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PAST_PREVIEW = 5

export function EventsFilter({ events, isOrgAdmin = false }: { events: EventItem[]; isOrgAdmin?: boolean }) {
  const [showAllPast, setShowAllPast] = useState(false)

  const open     = events.filter((e) => e.status === 'registration_open')
  const inSeason = events.filter((e) => e.status === 'active')
  const past     = events.filter((e) => e.status === 'completed' || e.status === 'archived')

  const visiblePast = showAllPast ? past : past.slice(0, PAST_PREVIEW)

  if (events.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400 text-sm">
        No events available yet.
      </div>
    )
  }

  return (
    <div className="space-y-10">

      {/* ── 1. Open for registration ─────────────────────────────────────────── */}
      {open.length > 0 && (
        <section>
          <SectionHeader label="Open for Registration" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {open.map((e) => (
              <FeaturedCard key={e.id} event={e} isOrgAdmin={isOrgAdmin} />
            ))}
          </div>
        </section>
      )}

      {/* ── 2. In season — always visible ───────────────────────────────────── */}
      {inSeason.length > 0 && (
        <section>
          <SectionHeader label="In Season" />
          <div className="bg-white rounded-2xl border px-4">
            {inSeason.map((e) => (
              <EventRow key={e.id} event={e} variant="inseason" />
            ))}
          </div>
        </section>
      )}

      {/* ── 3. Past events — collapsed beyond 5 ─────────────────────────────── */}
      {past.length > 0 && (
        <section>
          <SectionHeader label="Past Events" />
          <div className="bg-white rounded-2xl border px-4">
            {visiblePast.map((e) => (
              <EventRow key={e.id} event={e} variant="past" />
            ))}
          </div>

          {past.length > PAST_PREVIEW && (
            <button
              onClick={() => setShowAllPast((v) => !v)}
              className="mt-3 w-full text-sm font-medium py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
            >
              {showAllPast
                ? 'Show fewer'
                : `Show ${past.length - PAST_PREVIEW} more past event${past.length - PAST_PREVIEW !== 1 ? 's' : ''}`}
            </button>
          )}
        </section>
      )}

    </div>
  )
}
