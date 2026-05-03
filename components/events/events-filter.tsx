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
      {/* Green accent bar */}
      <div className="h-1.5 w-full shrink-0 bg-green-500" />

      <div className="flex flex-col flex-1 p-5 gap-4">
        {/* Status + sport */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Open for Registration
          </span>
          {event.sport && (
            <span className="text-xs text-gray-400 font-medium">{formatSport(event.sport)}</span>
          )}
        </div>

        {/* Name + date */}
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

        {/* Price + CTA */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          {(isOrgAdmin || event.price_cents !== undefined) ? (
            <span className="text-base font-bold text-green-600">
              {formatPrice(event.price_cents, event.currency)}
            </span>
          ) : <span />}
          <span className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white bg-green-500 group-hover:bg-green-600 transition-colors">
            Register →
          </span>
        </div>
      </div>
    </Link>
  )
}

// ── Compact list row ──────────────────────────────────────────────────────────

function EventRow({ event, tab }: { event: EventItem; tab: 'inseason' | 'past' }) {
  const href = tab === 'inseason'
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
          style={{ backgroundColor: tab === 'inseason' ? 'var(--brand-primary)' : '#d1d5db' }}
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
            {tab === 'past' ? formatYear(event.season_start_date) : formatDate(event.season_start_date)}
          </span>
        )}
        <svg
          className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
  inSeasonCount,
  pastCount,
}: {
  active: 'inseason' | 'past'
  onChange: (t: 'inseason' | 'past') => void
  inSeasonCount: number
  pastCount: number
}) {
  return (
    <div className="flex border-b border-gray-200">
      {(['inseason', 'past'] as const).map((tab) => {
        const label = tab === 'inseason' ? 'In Season' : 'Past Events'
        const count = tab === 'inseason' ? inSeasonCount : pastCount
        const isActive = active === tab
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-[var(--brand-primary)] text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
            }`}
          >
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              isActive ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-400'
            }`}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function EventsFilter({ events, isOrgAdmin = false }: { events: EventItem[]; isOrgAdmin?: boolean }) {
  const open     = events.filter((e) => e.status === 'registration_open')
  const inSeason = events.filter((e) => e.status === 'active')
  const past     = events.filter((e) => e.status === 'completed' || e.status === 'archived')

  const defaultTab: 'inseason' | 'past' = inSeason.length > 0 ? 'inseason' : 'past'
  const [tab, setTab] = useState<'inseason' | 'past'>(defaultTab)

  const hasTabs = inSeason.length > 0 || past.length > 0

  if (events.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400 text-sm">
        No events available yet.
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ── Featured: open for registration ─────────────────────────────────── */}
      {open.length > 0 && (
        <section className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {open.map((e) => (
              <FeaturedCard key={e.id} event={e} isOrgAdmin={isOrgAdmin} />
            ))}
          </div>
        </section>
      )}

      {/* ── Tabbed section: in-season + past ────────────────────────────────── */}
      {hasTabs && (
        <section className="bg-white rounded-2xl border overflow-hidden">
          {/* Only render the tab bar if both categories exist */}
          {inSeason.length > 0 && past.length > 0 ? (
            <div className="px-4">
              <TabBar
                active={tab}
                onChange={setTab}
                inSeasonCount={inSeason.length}
                pastCount={past.length}
              />
            </div>
          ) : (
            <div className="px-4 pt-4 pb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {inSeason.length > 0 ? 'In Season' : 'Past Events'}
              </p>
            </div>
          )}

          {/* List */}
          <div className="px-4 pb-2">
            {(tab === 'inseason' ? inSeason : past).map((e) => (
              <EventRow key={e.id} event={e} tab={tab} />
            ))}

            {/* Edge case: selected tab is empty */}
            {(tab === 'inseason' ? inSeason : past).length === 0 && (
              <p className="text-sm text-gray-400 py-6 text-center">
                {tab === 'inseason' ? 'No events currently in season.' : 'No past events yet.'}
              </p>
            )}
          </div>
        </section>
      )}

    </div>
  )
}
