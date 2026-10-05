'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { undoCheckIn, manualSessionCheckIn, undoSessionCheckIn, checkInByToken } from '@/actions/checkin'
import { toast } from 'sonner'

interface Registration {
  id: string                      // registration.id (event-level)
  playerName: string
  teamName: string | null
  checkinToken: string
  checkedInAt: string | null
  isWalkIn?: boolean
  sessionRegistrationId?: string | null  // present when in session mode
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
  function optimisticToggle(key: string, checkIn: boolean, useId = false) {
    setLocalRegs((prev) =>
      prev.map((r) => {
        // session mode: prefer sessionRegistrationId match, fall back to id for registration-flow drop-ins
        const matches = sessionId
          ? (useId ? r.id === key : (r.sessionRegistrationId ?? r.id) === key)
          : r.id === key
        return matches ? { ...r, checkedInAt: checkIn ? new Date().toISOString() : null } : r
      })
    )
  }

  function revertToggle(key: string, original: string | null, useId = false) {
    setLocalRegs((prev) =>
      prev.map((r) => {
        const matches = sessionId
          ? (useId ? r.id === key : (r.sessionRegistrationId ?? r.id) === key)
          : r.id === key
        return matches ? { ...r, checkedInAt: original } : r
      })
    )
  }

  // Rows with a check-in/undo in flight. The ref guards synchronously (a
  // double-tap lands before React re-renders); the state dims the button.
  const inFlight = useRef(new Set<string>())
  const [busyRows, setBusyRows] = useState<ReadonlySet<string>>(() => new Set())
  const rowKey = (reg: Registration) => reg.sessionRegistrationId ?? reg.id

  async function handleToggle(reg: Registration, currentlyCheckedIn: boolean) {
    const row = rowKey(reg)
    if (inFlight.current.has(row)) return
    inFlight.current.add(row)
    setBusyRows((b) => new Set(b).add(row))
    try {
      await toggle(reg, currentlyCheckedIn)
    } catch {
      // Dropped request at the door: the row turned green but nothing was
      // recorded. Put it back and say so.
      const useId = sessionId ? !reg.sessionRegistrationId : false
      const key = useId ? reg.id : (sessionId ? (reg.sessionRegistrationId ?? reg.id) : reg.id)
      revertToggle(key, reg.checkedInAt, useId)
      toast.error(`${currentlyCheckedIn ? "Couldn't undo" : "Couldn't check in"} ${reg.playerName} — check your connection and try again.`)
    } finally {
      inFlight.current.delete(row)
      setBusyRows((b) => { const n = new Set(b); n.delete(row); return n })
    }
  }

  async function toggle(reg: Registration, currentlyCheckedIn: boolean) {
    // Registration-flow drop-ins have no sessionRegistrationId — use reg.id as key
    const useId = sessionId ? !reg.sessionRegistrationId : false
    const key = useId ? reg.id : (sessionId ? (reg.sessionRegistrationId ?? reg.id) : reg.id)
    const original = reg.checkedInAt
    optimisticToggle(key, !currentlyCheckedIn, useId)

    if (currentlyCheckedIn) {
      // Undo
      const result = sessionId && reg.sessionRegistrationId
        ? await undoSessionCheckIn(reg.sessionRegistrationId, leagueId)
        : await undoCheckIn(reg.id, leagueId)
      if (result?.error) {
        revertToggle(key, original, useId)
        toast.error(`Couldn't undo ${reg.playerName}'s check-in. Try again.`)
      }
    } else {
      // Check in
      if (sessionId && reg.sessionRegistrationId) {
        const result = await manualSessionCheckIn(reg.sessionRegistrationId, leagueId)
        if (result?.error) {
          revertToggle(key, original, useId)
          toast.error(`Couldn't check in ${reg.playerName}. Try again.`)
        }
      } else {
        // Registration-flow drop-in or event-level: use checkin token (updates registrations table)
        const result = await checkInByToken(reg.checkinToken, leagueId)
        if (result.status !== 'success' && result.status !== 'already_checked_in') {
          revertToggle(key, original, useId)
          toast.error(`Couldn't check in ${reg.playerName}. Try again.`)
        }
      }
    }
  }

  return (
    <div>
      {/* Counter + search stay pinned while the roster scrolls — at the door
          you search, tap, search the next name. */}
      <div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-2 mb-1 bg-white/95 backdrop-blur-sm">
      <div className="mb-2">
        <p className="text-sm font-medium">
          <span style={{ color: 'var(--brand-primary-ink, var(--brand-primary))' }}>{checkedInCount}</span>
          <span className="text-gray-500"> / {localRegs.length} checked in</span>
          {hasFilters && (
            <span className="text-gray-500 ml-1">
              ({filtered.filter((r) => r.checkedInAt).length} / {filtered.length} shown)
            </span>
          )}
        </p>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player name…"
          aria-label="Search player name"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          className="flex-1 min-h-11 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
        />
        {teams.length > 0 && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            aria-label="Filter by team"
            className="min-h-11 border rounded-lg px-3 py-2 text-sm"
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
            className="press min-h-11 px-3 text-sm text-gray-600 hover:text-gray-800 border rounded-lg bg-white"
          >
            Clear
          </button>
        )}
      </div>
      </div>

      {/* Roster list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-500">
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
                      <span className="text-xs text-gray-500 truncate">{reg.teamName}</span>
                    )}
                    {checkedIn && reg.checkedInAt && (
                      <span className={`text-xs text-gray-500 ${reg.teamName ? 'before:content-["·"] before:mr-2' : ''}`}>
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
                  disabled={busyRows.has(key)}
                  aria-busy={busyRows.has(key) || undefined}
                  aria-pressed={checkedIn}
                  className={`press shrink-0 flex items-center gap-1.5 min-h-11 px-4 rounded-full text-sm font-semibold disabled:opacity-60 ${
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
