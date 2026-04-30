'use client'

import { useState, useMemo, useTransition } from 'react'
import { checkInByToken, undoCheckIn } from '@/actions/checkin'

interface Registration {
  id: string
  playerName: string
  teamName: string | null
  checkinToken: string
  checkedInAt: string | null
}

interface Props {
  registrations: Registration[]
  leagueId: string
  timezone: string
}

// ─── Individual row / card ────────────────────────────────────────────────────

function useCheckInRow(reg: Registration, leagueId: string) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCheckIn() {
    setError(null)
    startTransition(async () => {
      const result = await checkInByToken(reg.checkinToken, leagueId)
      if (result.status === 'not_found') setError('Token not found')
      else if (result.status === 'unauthorized') setError('Not authorised')
    })
  }

  function handleUndo() {
    setError(null)
    startTransition(async () => {
      const result = await undoCheckIn(reg.id, leagueId)
      if (result?.error) setError(result.error)
    })
  }

  return { isPending, error, handleCheckIn, handleUndo }
}

// ─── Desktop table row ────────────────────────────────────────────────────────

function TableRow({
  reg,
  leagueId,
  timezone,
}: {
  reg: Registration
  leagueId: string
  timezone: string
}) {
  const { isPending, error, handleCheckIn, handleUndo } = useCheckInRow(reg, leagueId)

  return (
    <tr
      className={`border-b last:border-0 ${isPending ? 'opacity-50' : ''}`}
      title={error ?? undefined}
    >
      <td className="px-4 py-3">
        <div className="font-medium">{reg.playerName}</div>
        {reg.teamName && <div className="text-xs text-gray-400">{reg.teamName}</div>}
      </td>
      <td className="px-4 py-3">
        {reg.checkedInAt ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            ✓ Checked in
          </span>
        ) : (
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Not checked in
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {reg.checkedInAt
          ? new Date(reg.checkedInAt).toLocaleTimeString('en-CA', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: timezone,
            })
          : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        {reg.checkedInAt ? (
          <button
            onClick={handleUndo}
            disabled={isPending}
            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
          >
            Undo
          </button>
        ) : (
          <button
            onClick={handleCheckIn}
            disabled={isPending}
            className="text-xs font-medium hover:underline"
            style={{ color: 'var(--brand-primary)' }}
          >
            Check in
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function MobileCard({
  reg,
  leagueId,
  timezone,
}: {
  reg: Registration
  leagueId: string
  timezone: string
}) {
  const { isPending, error, handleCheckIn, handleUndo } = useCheckInRow(reg, leagueId)
  const checkedIn = !!reg.checkedInAt

  return (
    <div className={`bg-white rounded-lg border p-4 ${isPending ? 'opacity-50' : ''}`}>
      {/* Top row: name + status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{reg.playerName}</p>
          {reg.teamName && (
            <p className="text-xs text-gray-500 truncate">{reg.teamName}</p>
          )}
        </div>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
            checkedIn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {checkedIn ? '✓ Checked in' : 'Not checked in'}
        </span>
      </div>

      {/* Bottom row: time + action button */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t gap-3">
        <span className="text-xs text-gray-400">
          {reg.checkedInAt
            ? new Date(reg.checkedInAt).toLocaleTimeString('en-CA', {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: timezone,
              })
            : '—'}
        </span>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-500">{error}</span>}
          {checkedIn ? (
            <button
              onClick={handleUndo}
              disabled={isPending}
              className="text-sm text-gray-400 hover:text-red-600 transition-colors px-3 py-1.5 rounded border border-gray-200 hover:border-red-200"
            >
              Undo
            </button>
          ) : (
            <button
              onClick={handleCheckIn}
              disabled={isPending}
              className="text-sm font-semibold text-white px-4 py-1.5 rounded-md disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isPending ? 'Checking in…' : 'Check In'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main list component ──────────────────────────────────────────────────────

export function CheckInList({ registrations, leagueId, timezone }: Props) {
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('all')

  const teams = useMemo(() => {
    const seen = new Set<string>()
    for (const r of registrations) {
      if (r.teamName) seen.add(r.teamName)
    }
    return Array.from(seen).sort()
  }, [registrations])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return registrations.filter((r) => {
      if (q && !r.playerName.toLowerCase().includes(q)) return false
      if (teamFilter !== 'all' && r.teamName !== teamFilter) return false
      return true
    })
  }, [registrations, search, teamFilter])

  const hasFilters = search || teamFilter !== 'all'
  const checkedInCount = registrations.filter((r) => r.checkedInAt).length
  const filteredCheckedIn = filtered.filter((r) => r.checkedInAt).length

  return (
    <div>
      {/* Counter */}
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm font-medium">
          <span style={{ color: 'var(--brand-primary)' }}>{checkedInCount}</span>
          <span className="text-gray-400"> / {registrations.length} checked in</span>
        </p>
        {hasFilters && (
          <p className="text-xs text-gray-400">
            ({filteredCheckedIn} / {filtered.length} shown)
          </p>
        )}
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player name…"
          className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
        />
        {teams.length > 0 && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setTeamFilter('all') }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-md bg-white"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Desktop table (md+) ── */}
      <div className="hidden md:block bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Player</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Time</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((reg) => (
                <TableRow key={reg.id} reg={reg} leagueId={leagueId} timezone={timezone} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                    {hasFilters ? 'No players match your search.' : 'No registrations yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile cards (below md) ── */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border p-10 text-center text-gray-400 text-sm">
            {hasFilters ? 'No players match your search.' : 'No registrations yet.'}
          </div>
        ) : (
          filtered.map((reg) => (
            <MobileCard key={reg.id} reg={reg} leagueId={leagueId} timezone={timezone} />
          ))
        )}
      </div>
    </div>
  )
}
