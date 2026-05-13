'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { undoCheckIn, manualSessionCheckIn, undoSessionCheckIn, checkInByToken } from '@/actions/checkin'

interface Registration {
  id: string                      // registration.id (event-level)
  playerName: string
  teamName: string | null
  checkinToken: string
  checkedInAt: string | null
  isWalkIn?: boolean
  sessionRegistrationId?: string  // present when in session mode
}

interface Props {
  registrations: Registration[]
  leagueId: string
  timezone: string
  sessionId?: string              // if provided, use per-session check-in actions
}

export function CheckInList({ registrations, leagueId, timezone, sessionId }: Props) {
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('all')

  // Local copy for optimistic updates
  const [localRegs, setLocalRegs] = useState(registrations)
  useEffect(() => { setLocalRegs(registrations) }, [registrations])

  const [isPendingAll, startAllTransition] = useTransition()

  const teams = useMemo(() => {
    const seen = new Set<string>()
    for (const r of localRegs) {
      if (r.teamName) seen.add(r.teamName)
    }
    return Array.from(seen).sort()
  }, [localRegs])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return localRegs.filter((r) => {
      if (q && !r.playerName.toLowerCase().includes(q)) return false
      if (teamFilter !== 'all' && r.teamName !== teamFilter) return false
      return true
    })
  }, [localRegs, search, teamFilter])

  const hasFilters = search || teamFilter !== 'all'
  const checkedInCount = localRegs.filter((r) => r.checkedInAt).length
  const unchecked = localRegs.filter((r) => !r.checkedInAt)

  function optimisticToggle(key: string, checkIn: boolean) {
    setLocalRegs((prev) =>
      prev.map((r) => {
        const matches = sessionId ? r.sessionRegistrationId === key : r.id === key
        return matches ? { ...r, checkedInAt: checkIn ? new Date().toISOString() : null } : r
      })
    )
  }

  function revertToggle(key: string, original: string | null) {
    setLocalRegs((prev) =>
      prev.map((r) => {
        const matches = sessionId ? r.sessionRegistrationId === key : r.id === key
        return matches ? { ...r, checkedInAt: original } : r
      })
    )
  }

  async function handleToggle(reg: Registration, currentlyCheckedIn: boolean) {
    const key = sessionId ? (reg.sessionRegistrationId ?? reg.id) : reg.id
    const original = reg.checkedInAt
    optimisticToggle(key, !currentlyCheckedIn)

    if (currentlyCheckedIn) {
      // Undo
      const result = sessionId && reg.sessionRegistrationId
        ? await undoSessionCheckIn(reg.sessionRegistrationId, leagueId)
        : await undoCheckIn(reg.id, leagueId)
      if (result?.error) revertToggle(key, original)
    } else {
      // Check in
      if (sessionId && reg.sessionRegistrationId) {
        const result = await manualSessionCheckIn(reg.sessionRegistrationId, leagueId)
        if (result?.error) revertToggle(key, original)
      } else {
        const result = await checkInByToken(reg.checkinToken, leagueId)
        if (result.status !== 'success' && result.status !== 'already_checked_in') {
          revertToggle(key, original)
        }
      }
    }
  }

  function handleCheckInAll() {
    if (unchecked.length === 0) return
    const now = new Date().toISOString()
    // Optimistic: mark all unchecked as checked in
    setLocalRegs((prev) => prev.map((r) => ({ ...r, checkedInAt: r.checkedInAt ?? now })))
    startAllTransition(async () => {
      await Promise.all(
        unchecked.map((reg) => {
          if (sessionId && reg.sessionRegistrationId) {
            return manualSessionCheckIn(reg.sessionRegistrationId, leagueId)
          }
          return checkInByToken(reg.checkinToken, leagueId)
        })
      )
    })
  }

  return (
    <div>
      {/* Counter + Check In All */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <p className="text-sm font-medium shrink-0">
          <span style={{ color: 'var(--brand-primary)' }}>{checkedInCount}</span>
          <span className="text-gray-400"> / {localRegs.length} checked in</span>
          {hasFilters && (
            <span className="text-gray-400 ml-1">
              ({filtered.filter((r) => r.checkedInAt).length} / {filtered.length} shown)
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={handleCheckInAll}
          disabled={unchecked.length === 0 || isPendingAll}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          style={
            unchecked.length > 0
              ? { backgroundColor: 'var(--brand-primary)', color: 'white' }
              : { backgroundColor: '#f0fdf4', color: '#15803d' }
          }
        >
          {unchecked.length === 0
            ? '✓ All Checked In'
            : isPendingAll
              ? 'Checking in…'
              : `Check In All (${unchecked.length})`}
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player name…"
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
        />
        {teams.length > 0 && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
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
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-lg bg-white"
          >
            Clear
          </button>
        )}
      </div>

      {/* Roster list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">
            {hasFilters ? 'No players match your search.' : 'No registrations yet.'}
          </div>
        ) : (
          filtered.map((reg) => {
            const key = reg.sessionRegistrationId ?? reg.id
            const checkedIn = !!reg.checkedInAt
            return (
              <div
                key={key}
                className="flex items-center gap-3 px-4 py-3.5 border-b last:border-0"
              >
                {/* Player info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 truncate">{reg.playerName}</p>
                    {reg.isWalkIn && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 text-amber-700">
                        Walk-in
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {reg.teamName && (
                      <span className="text-xs text-gray-400 truncate">{reg.teamName}</span>
                    )}
                    {checkedIn && reg.checkedInAt && (
                      <span className={`text-xs text-gray-400 ${reg.teamName ? 'before:content-["·"] before:mr-2' : ''}`}>
                        {new Date(reg.checkedInAt).toLocaleTimeString('en-CA', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: timezone,
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Toggle button */}
                <button
                  type="button"
                  onClick={() => handleToggle(reg, checkedIn)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    checkedIn
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${checkedIn ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {checkedIn ? 'Checked In' : 'Check In'}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
