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

interface FilterPillProps {
  label: string
  active: boolean
  count?: number
  onClick: () => void
  activeStyle?: React.CSSProperties
  activeClass?: string
}

function FilterPill({ label, active, count, onClick, activeStyle, activeClass }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
        active
          ? `text-white ${activeClass ?? ''}`
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
      style={active ? (activeStyle ?? { backgroundColor: 'var(--brand-primary)' }) : {}}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
          active ? 'bg-white/25' : 'bg-gray-200 text-gray-500'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}

export function EventsFilter({ events }: { events: EventItem[] }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [sportFilter, setSportFilter] = useState<string | null>(null)

  // Derive unique types, statuses, sports present in the data
  const types = useMemo(() => {
    const s = new Set(events.map((e) => e.event_type ?? 'league'))
    return [...s].sort()
  }, [events])

  const sports = useMemo(() => {
    const s = new Set(events.map((e) => e.sport).filter(Boolean) as string[])
    return [...s].sort()
  }, [events])

  const statuses = useMemo(() => {
    const order = ['registration_open', 'active', 'completed', 'archived']
    const s = new Set(events.map((e) => e.status))
    return order.filter((st) => s.has(st))
  }, [events])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q) && !(e.sport ?? '').toLowerCase().includes(q)) return false
      if (typeFilter && (e.event_type ?? 'league') !== typeFilter) return false
      if (statusFilter && e.status !== statusFilter) return false
      if (sportFilter && e.sport !== sportFilter) return false
      return true
    })
  }, [events, query, typeFilter, statusFilter, sportFilter])

  // Count badges per filter (counting against everything except that dimension)
  function typeCount(t: string) {
    return events.filter((e) => {
      const q = query.trim().toLowerCase()
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (statusFilter && e.status !== statusFilter) return false
      if (sportFilter && e.sport !== sportFilter) return false
      return (e.event_type ?? 'league') === t
    }).length
  }

  function statusCount(s: string) {
    return events.filter((e) => {
      const q = query.trim().toLowerCase()
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (typeFilter && (e.event_type ?? 'league') !== typeFilter) return false
      if (sportFilter && e.sport !== sportFilter) return false
      return e.status === s
    }).length
  }

  function sportCount(sp: string) {
    return events.filter((e) => {
      const q = query.trim().toLowerCase()
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (typeFilter && (e.event_type ?? 'league') !== typeFilter) return false
      if (statusFilter && e.status !== statusFilter) return false
      return e.sport === sp
    }).length
  }

  const hasActiveFilters = !!query || typeFilter !== null || statusFilter !== null || sportFilter !== null

  return (
    <div className="space-y-5">
      {/* Search */}
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
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:border-transparent"
          style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
        />
      </div>

      {/* Filter rows */}
      <div className="space-y-2">
        {/* Status */}
        {statuses.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <FilterPill
              label="All" active={statusFilter === null}
              count={statusFilter === null ? undefined : undefined}
              onClick={() => setStatusFilter(null)}
              activeStyle={{ backgroundColor: 'var(--brand-secondary)' }}
            />
            {statuses.map((s) => (
              <FilterPill
                key={s}
                label={STATUS_LABELS[s] ?? s}
                active={statusFilter === s}
                count={statusFilter !== s ? statusCount(s) : undefined}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
              />
            ))}
          </div>
        )}

        {/* Type — only show if more than one type exists */}
        {types.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <FilterPill
                key={t}
                label={EVENT_TYPE_LABELS[t] ?? t}
                active={typeFilter === t}
                count={typeFilter !== t ? typeCount(t) : undefined}
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                activeStyle={{ backgroundColor: 'var(--brand-primary)' }}
              />
            ))}
          </div>
        )}

        {/* Sport — only show if more than one sport exists */}
        {sports.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {sports.map((sp) => (
              <FilterPill
                key={sp}
                label={formatSport(sp)}
                active={sportFilter === sp}
                count={sportFilter !== sp ? sportCount(sp) : undefined}
                onClick={() => setSportFilter(sportFilter === sp ? null : sp)}
                activeStyle={{ backgroundColor: 'var(--brand-primary)' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Results summary + clear */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? 'event' : 'events'} found
          </p>
          <button
            onClick={() => { setQuery(''); setTypeFilter(null); setStatusFilter(null); setSportFilter(null) }}
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--brand-primary)' }}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Event cards */}
      <div className="space-y-3">
        {filtered.map((league) => {
          const et = league.event_type ?? 'league'
          return (
            <Link
              key={league.id}
              href={`/events/${league.slug}`}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white rounded-lg shadow-sm border p-4 sm:p-5 hover:shadow-md transition-shadow gap-3"
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
                  league.status === 'active' ? 'bg-blue-100 text-blue-800' :
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
            {hasActiveFilters
              ? 'No events match your filters.'
              : 'No events available yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
