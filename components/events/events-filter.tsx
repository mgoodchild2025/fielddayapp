'use client'

import { useState, useMemo } from 'react'
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

const EVENT_TYPE_LABELS: Record<string, string> = {
  league: 'League',
  tournament: 'Tournament',
  pickup: 'Pickup',
  drop_in: 'Drop-in',
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  league: 'bg-indigo-100 text-indigo-700',
  tournament: 'bg-orange-100 text-orange-700',
  pickup: 'bg-teal-100 text-teal-700',
  drop_in: 'bg-pink-100 text-pink-700',
}

const STATUS_LABELS: Record<string, string> = {
  registration_open: 'Open',
  active: 'In Season',
  completed: 'Completed',
  archived: 'Archived',
}

function formatSport(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPrice(cents: number, currency: string) {
  return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(0)} ${currency.toUpperCase()}`
}

// ── Pill (secondary filters) ─────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'text-white' : 'bg-white/70 text-gray-600 hover:bg-white border border-gray-200'
      }`}
      style={active ? { backgroundColor: 'var(--brand-primary)' } : {}}
    >
      {label}
    </button>
  )
}

// Horizontal scroll row that bleeds to viewport edge on mobile
function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative -mx-4 sm:mx-0">
      <div className="flex gap-2 overflow-x-auto px-4 sm:px-0 pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {children}
      </div>
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0.5 w-8 sm:hidden"
        style={{ background: `linear-gradient(to left, var(--brand-bg, #f8f8f8), transparent)` }}
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EventsFilter({ events }: { events: EventItem[] }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [sportFilter, setSportFilter] = useState<string | null>(null)

  const statuses = useMemo(() => {
    const order = ['registration_open', 'active', 'completed', 'archived']
    const present = new Set(events.map((e) => e.status))
    return order.filter((s) => present.has(s))
  }, [events])

  const types = useMemo(() => {
    const s = new Set(events.map((e) => e.event_type ?? 'league'))
    return [...s].sort()
  }, [events])

  const sports = useMemo(() => {
    const s = new Set(events.map((e) => e.sport).filter(Boolean) as string[])
    return [...s].sort()
  }, [events])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q) && !(e.sport ?? '').toLowerCase().includes(q)) return false
      if (statusFilter && e.status !== statusFilter) return false
      if (typeFilter && (e.event_type ?? 'league') !== typeFilter) return false
      if (sportFilter && e.sport !== sportFilter) return false
      return true
    })
  }, [events, query, statusFilter, typeFilter, sportFilter])

  // Count of events that would match if you picked a given status tab
  function countForStatus(s: string | null) {
    const q = query.trim().toLowerCase()
    return events.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (typeFilter && (e.event_type ?? 'league') !== typeFilter) return false
      if (sportFilter && e.sport !== sportFilter) return false
      return s === null || e.status === s
    }).length
  }

  const hasSecondaryFilters = types.length > 1 || sports.length > 1
  const hasActiveFilters = !!query || statusFilter !== null || typeFilter !== null || sportFilter !== null

  function clearAll() {
    setQuery('')
    setStatusFilter(null)
    setTypeFilter(null)
    setSportFilter(null)
  }

  return (
    <div className="space-y-4">

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events…"
          className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:border-transparent"
          style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
        />
      </div>

      {/* ── Status tabs ────────────────────────────────────────────────────── */}
      {statuses.length > 1 && (
        <div className="bg-gray-100 rounded-xl p-1 flex">
          {/* "All" tab */}
          <button
            onClick={() => setStatusFilter(null)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              statusFilter === null
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            All
            {statusFilter !== null && (
              <span className="ml-1 text-xs text-gray-400">
                {countForStatus(null)}
              </span>
            )}
          </button>

          {statuses.map((s) => {
            const active = statusFilter === s
            const count = countForStatus(s)
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? null : s)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all leading-tight px-1 ${
                  active
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {STATUS_LABELS[s] ?? s}
                {!active && count > 0 && (
                  <span className="ml-1 text-xs text-gray-400">{count}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Secondary filters (type + sport) ───────────────────────────────── */}
      {hasSecondaryFilters && (
        <ScrollRow>
          {types.length > 1 && types.map((t) => (
            <Pill
              key={t}
              label={EVENT_TYPE_LABELS[t] ?? t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            />
          ))}
          {sports.length > 1 && sports.map((sp) => (
            <Pill
              key={sp}
              label={formatSport(sp)}
              active={sportFilter === sp}
              onClick={() => setSportFilter(sportFilter === sp ? null : sp)}
            />
          ))}
        </ScrollRow>
      )}

      {/* ── Result count + clear ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between min-h-[20px]">
        <p className="text-sm text-gray-400">
          {hasActiveFilters
            ? `${filtered.length} of ${events.length} events`
            : `${events.length} event${events.length !== 1 ? 's' : ''}`}
        </p>
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--brand-primary)' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Event cards ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {filtered.map((league) => {
          const et = league.event_type ?? 'league'
          return (
            <Link
              key={league.id}
              href={`/events/${league.slug}`}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white rounded-xl shadow-sm border p-4 sm:p-5 hover:shadow-md transition-shadow gap-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${EVENT_TYPE_COLORS[et] ?? 'bg-gray-100 text-gray-600'}`}>
                    {EVENT_TYPE_LABELS[et] ?? et}
                  </span>
                  {league.sport && (
                    <span className="text-xs text-gray-400">{formatSport(league.sport)}</span>
                  )}
                </div>
                <h2 className="text-lg font-bold truncate" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                  {league.name}
                </h2>
                {league.season_start_date && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    Starts {new Date(league.season_start_date).toLocaleDateString('en-CA', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                )}
              </div>

              <div className="sm:text-right flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                  league.status === 'registration_open' ? 'bg-green-100 text-green-800' :
                  league.status === 'active'            ? 'bg-blue-100 text-blue-800' :
                                                          'bg-gray-100 text-gray-600'
                }`}>
                  {STATUS_LABELS[league.status] ?? league.status}
                </span>
                <p className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                  {formatPrice(league.price_cents, league.currency)}
                </p>
              </div>
            </Link>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            {hasActiveFilters ? 'No events match your filters.' : 'No events available yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
