'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { DeleteEventRowButton } from '@/components/events/delete-event-row-button'

type League = {
  id: string
  name: string
  slug: string
  status: string
  event_type: string | null
  price_cents: number
  currency: string
  season_start_date: string | null
  venue_name: string | null
  created_at: string
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  registration_open: 'bg-green-100 text-green-700',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-purple-100 text-purple-700',
  archived: 'bg-gray-100 text-gray-400',
}

const eventTypeColors: Record<string, string> = {
  league: 'bg-indigo-100 text-indigo-700',
  tournament: 'bg-orange-100 text-orange-700',
  pickup: 'bg-teal-100 text-teal-700',
  drop_in: 'bg-pink-100 text-pink-700',
}

const eventTypeLabels: Record<string, string> = {
  league: 'League',
  tournament: 'Tournament',
  pickup: 'Pickup',
  drop_in: 'Drop-in',
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  registration_open: 'Open',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
}

export function EventsTable({ leagues }: { leagues: League[] }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const types = useMemo(() => {
    const seen = new Set(leagues.map(l => l.event_type ?? 'league'))
    return Array.from(seen)
  }, [leagues])

  const statuses = useMemo(() => {
    const seen = new Set(leagues.map(l => l.status))
    return Array.from(seen)
  }, [leagues])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leagues.filter(l => {
      if (q && !l.name.toLowerCase().includes(q) && !(l.venue_name ?? '').toLowerCase().includes(q)) return false
      if (typeFilter !== 'all' && (l.event_type ?? 'league') !== typeFilter) return false
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      return true
    })
  }, [leagues, search, typeFilter, statusFilter])

  const hasFilters = search || typeFilter !== 'all' || statusFilter !== 'all'

  return (
    <>
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search events…"
          className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
          style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All types</option>
          {types.map(t => (
            <option key={t} value={t}>{eventTypeLabels[t] ?? t}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {statuses.map(s => (
            <option key={s} value={s}>{statusLabels[s] ?? s}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all') }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-md bg-white"
          >
            Clear
          </button>
        )}
      </div>

      {hasFilters && (
        <p className="text-xs text-gray-400 mb-3">
          {filtered.length} of {leagues.length} event{leagues.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── Desktop table (md+) ── */}
      <div className="hidden md:block bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Location</th>
                <th className="px-4 py-3 font-medium text-gray-500">Price</th>
                <th className="px-4 py-3 font-medium text-gray-500">Start Date</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(league => (
                <tr key={league.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/events/${league.id}`} className="hover:underline" style={{ color: 'var(--brand-primary)' }}>
                      {league.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${eventTypeColors[league.event_type ?? 'league'] ?? 'bg-gray-100 text-gray-600'}`}>
                      {eventTypeLabels[league.event_type ?? 'league'] ?? league.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[league.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[league.status] ?? league.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{league.venue_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {league.price_cents === 0 ? 'Free' : `$${(league.price_cents / 100).toFixed(0)} ${league.currency.toUpperCase()}`}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {league.season_start_date ? new Date(league.season_start_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <Link href={`/admin/events/${league.id}`} className="text-xs font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
                      Manage →
                    </Link>
                    <DeleteEventRowButton leagueId={league.id} eventName={league.name} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    {hasFilters ? 'No events match your search.' : (
                      <>No events yet. <Link href="/admin/events/new" className="underline" style={{ color: 'var(--brand-primary)' }}>Create your first event</Link></>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile cards (below md) ── */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border p-10 text-center text-gray-400 text-sm">
            {hasFilters ? 'No events match your search.' : (
              <>No events yet. <Link href="/admin/events/new" className="underline" style={{ color: 'var(--brand-primary)' }}>Create your first event</Link></>
            )}
          </div>
        ) : (
          filtered.map(league => (
            <Link
              key={league.id}
              href={`/admin/events/${league.id}`}
              className="block bg-white rounded-lg border p-4 hover:shadow-sm transition-shadow"
            >
              {/* Name */}
              <p className="font-semibold mb-2" style={{ color: 'var(--brand-primary)' }}>
                {league.name}
              </p>

              {/* Type + Status badges */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${eventTypeColors[league.event_type ?? 'league'] ?? 'bg-gray-100 text-gray-600'}`}>
                  {eventTypeLabels[league.event_type ?? 'league'] ?? league.event_type}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[league.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {statusLabels[league.status] ?? league.status}
                </span>
              </div>

              {/* Secondary details */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                {league.venue_name && <span>{league.venue_name}</span>}
                {league.season_start_date && (
                  <span>{new Date(league.season_start_date).toLocaleDateString()}</span>
                )}
                <span>
                  {league.price_cents === 0 ? 'Free' : `$${(league.price_cents / 100).toFixed(0)} ${league.currency.toUpperCase()}`}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  )
}
