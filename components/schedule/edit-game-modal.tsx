'use client'

import { parseLocalToUtc } from '@/lib/format-time'

import { useState, useTransition } from 'react'
import { updateGame, deleteGame, cancelGame, postponeGame, restoreGame } from '@/actions/schedule'
import { venueLabel } from '@/lib/venue-label'
import { confirmAction } from '@/components/ui/confirm-dialog'

interface Team {
  id: string
  name: string
}

interface Pool {
  id: string
  name: string
}

interface Props {
  game: {
    id: string
    leagueId: string
    homeTeamId: string | null
    awayTeamId: string | null
    homeTeamLabel: string | null
    awayTeamLabel: string | null
    scheduledAt: string
    court: string | null
    weekNumber: number | null
    poolId: string | null | undefined
    status: string
    cancellationReason: string | null
    isExhibition?: boolean
  }
  teams: Team[]
  pools?: Pool[]
  sport?: string
  onClose: () => void
  onDeleted: () => void
  onStatusChanged?: (gameId: string, newStatus: string, reason: string | null) => void
  /** Org display timezone — the time field is in org time, not the phone's. */
  timezone: string
}

// The datetime-local input shows and edits the time in the ORG's timezone.
// It used the phone's own timezone, so an admin travelling (or with a phone
// set to another zone) saw the wrong time and saving shifted the game.
function toOrgDatetimeValue(utcIso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(utcIso)).map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function EditGameModal({ game, teams, pools = [], sport, onClose, onDeleted, onStatusChanged, timezone }: Props) {
  const [homeTeamId, setHomeTeamId] = useState(game.homeTeamId ?? '')
  const [awayTeamId, setAwayTeamId] = useState(game.awayTeamId ?? '')
  const [homeTeamLabel, setHomeTeamLabel] = useState(game.homeTeamLabel ?? '')
  const [awayTeamLabel, setAwayTeamLabel] = useState(game.awayTeamLabel ?? '')
  const [scheduledAt, setScheduledAt] = useState(toOrgDatetimeValue(game.scheduledAt, timezone))
  const [court, setCourt] = useState(game.court ?? '')
  const [weekNumber, setWeekNumber] = useState(game.weekNumber?.toString() ?? '')
  const [poolId, setPoolId] = useState(game.poolId ?? '')
  const [isExhibition, setIsExhibition] = useState(game.isExhibition ?? false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Cancel / postpone / restore state
  const [gameStatus, setGameStatus] = useState(game.status ?? 'scheduled')
  const [statusReason, setStatusReason] = useState(game.cancellationReason ?? '')
  const [notifyTeams, setNotifyTeams] = useState(true)
  const [statusAction, setStatusAction] = useState<'cancel' | 'postpone' | null>(null)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updateGame({
        gameId: game.id,
        leagueId: game.leagueId,
        homeTeamId: homeTeamId || undefined,
        awayTeamId: awayTeamId || undefined,
        homeTeamLabel: homeTeamLabel || undefined,
        awayTeamLabel: awayTeamLabel || undefined,
        scheduledAt: parseLocalToUtc(scheduledAt.slice(0, 10), scheduledAt.slice(11, 16), timezone),
        court: court || undefined,
        weekNumber: weekNumber ? Number(weekNumber) : undefined,
        poolId: poolId || null,
        isExhibition,
      })
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
      }
    })
  }

  async function handleDelete() {
    if (!(await confirmAction({
      title: 'Delete this game?',
      message: 'The game and any result are removed. This can\'t be undone.',
      confirmLabel: 'Delete game',
      destructive: true,
    }))) return
    startTransition(async () => {
      const result = await deleteGame(game.id, game.leagueId)
      if (result.error) {
        setError(result.error)
      } else {
        onDeleted()
      }
    })
  }

  function handleCancelGame() {
    startTransition(async () => {
      const result = await cancelGame({ gameId: game.id, leagueId: game.leagueId, reason: statusReason || undefined, notify: notifyTeams })
      if (result.error) { setError(result.error) } else { setGameStatus('cancelled'); setStatusAction(null); onStatusChanged?.(game.id, 'cancelled', statusReason || null) }
    })
  }

  function handlePostponeGame() {
    startTransition(async () => {
      const result = await postponeGame({ gameId: game.id, leagueId: game.leagueId, reason: statusReason || undefined, notify: notifyTeams })
      if (result.error) { setError(result.error) } else { setGameStatus('postponed'); setStatusAction(null); onStatusChanged?.(game.id, 'postponed', statusReason || null) }
    })
  }

  async function handleRestoreGame() {
    // With notify on this emails both teams — not a one-tap action.
    if (notifyTeams && !(await confirmAction({
      title: 'Put this game back on?',
      message: 'Both teams get a "Game back on" email and notification.',
      confirmLabel: 'Restore and notify',
    }))) return
    startTransition(async () => {
      const result = await restoreGame({ gameId: game.id, leagueId: game.leagueId, notify: notifyTeams })
      if (result.error) { setError(result.error) } else { setGameStatus('scheduled'); setStatusReason(''); onStatusChanged?.(game.id, 'scheduled', null) }
    })
  }

  // Rendered inside an Overlay (see schedule-table.tsx), which supplies the
  // backdrop, motion, scroll lock, Escape and focus handling.
  return (
    <>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 id="edit-game-title" className="font-semibold text-base">Edit Game</h2>
            {gameStatus === 'cancelled' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>
            )}
            {gameStatus === 'postponed' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Postponed</span>
            )}
          </div>
          <button onClick={onClose} className="w-10 h-10 -mr-3 -mt-2 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date & Time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
              className="w-full border rounded px-2 min-h-10 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Home Team</label>
            <select
              value={homeTeamId}
              onChange={(e) => { setHomeTeamId(e.target.value); if (e.target.value) setHomeTeamLabel('') }}
              className="w-full border rounded px-2 min-h-10 text-sm"
            >
              <option value="">— unassigned —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {!homeTeamId && (
              <input
                type="text"
                value={homeTeamLabel}
                onChange={(e) => setHomeTeamLabel(e.target.value)}
                placeholder="Label (e.g. Team 1)"
                className="mt-1 w-full border rounded px-2 min-h-10 text-sm text-gray-600"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Away Team</label>
            <select
              value={awayTeamId}
              onChange={(e) => { setAwayTeamId(e.target.value); if (e.target.value) setAwayTeamLabel('') }}
              className="w-full border rounded px-2 min-h-10 text-sm"
            >
              <option value="">— unassigned —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {!awayTeamId && (
              <input
                type="text"
                value={awayTeamLabel}
                onChange={(e) => setAwayTeamLabel(e.target.value)}
                placeholder="Label (e.g. Team 2)"
                className="mt-1 w-full border rounded px-2 min-h-10 text-sm text-gray-600"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{venueLabel(sport)}</label>
              <input
                type="text"
                value={court}
                onChange={(e) => setCourt(e.target.value)}
                placeholder="e.g. A"
                className="w-full border rounded px-2 min-h-10 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Week #</label>
              <input
                type="number" inputMode="numeric"
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value)}
                min={1}
                className="w-full border rounded px-2 min-h-10 text-sm"
              />
            </div>
          </div>

          {pools.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pool</label>
              <select
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                className="w-full border rounded px-2 min-h-10 text-sm"
              >
                <option value="">— None —</option>
                {pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Exhibition: played and scored, badged on schedules, never moves the table */}
          <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={isExhibition} onChange={(e) => setIsExhibition(e.target.checked)} className="rounded mt-0.5" />
            <span>
              <span className="font-medium">Exhibition game</span>
              <span className="block text-[11px] text-gray-400">Scores are recorded and shown, but the result doesn&rsquo;t count toward standings.</span>
            </span>
          </label>

          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2 rounded text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm font-medium border text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* ── Cancel / Postpone / Restore ── */}
        <div className="mt-4 pt-3 border-t space-y-2">
          {gameStatus === 'scheduled' ? (
            <>
              {statusAction === null ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusAction('postpone')}
                    className="press flex-1 min-h-10 rounded text-xs font-medium border border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    Postpone
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusAction('cancel')}
                    className="press flex-1 min-h-10 rounded text-xs font-medium border border-red-300 text-red-600 hover:bg-red-50"
                  >
                    Cancel Game
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700">
                    {statusAction === 'cancel' ? 'Cancel this game?' : 'Mark as postponed?'}
                  </p>
                  <input
                    type="text"
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="Reason (optional — shown to players)"
                    className="w-full min-h-10 border rounded px-2 text-base sm:text-xs text-gray-700"
                  />
                  <label className="flex items-center gap-2 min-h-10 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={notifyTeams} onChange={(e) => setNotifyTeams(e.target.checked)} className="rounded" />
                    Notify both teams by email
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={statusAction === 'cancel' ? handleCancelGame : handlePostponeGame}
                      disabled={isPending}
                      className={`press flex-1 min-h-10 rounded text-xs font-semibold text-white disabled:opacity-50 ${statusAction === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
                    >
                      {isPending ? 'Saving…' : statusAction === 'cancel' ? 'Yes, Cancel' : 'Yes, Postpone'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStatusAction(null); setStatusReason('') }}
                      className="press flex-1 min-h-10 rounded text-xs font-medium border text-gray-600 hover:bg-gray-50"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {(game.cancellationReason || statusReason) && (
                <p className="text-xs text-gray-500 italic">&ldquo;{statusReason || game.cancellationReason}&rdquo;</p>
              )}
              <label className="flex items-center gap-2 min-h-10 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={notifyTeams} onChange={(e) => setNotifyTeams(e.target.checked)} className="rounded" />
                Notify both teams when restoring
              </label>
              <button
                type="button"
                onClick={handleRestoreGame}
                disabled={isPending}
                className="press w-full min-h-10 rounded text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                {isPending ? 'Restoring…' : 'Restore Game'}
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t">
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="press min-h-10 text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {isPending ? 'Deleting…' : 'Delete game'}
          </button>
        </div>
    </>
  )
}
