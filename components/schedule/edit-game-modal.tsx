'use client'

import { useState, useTransition } from 'react'
import { updateGame, deleteGame, cancelGame, postponeGame, restoreGame } from '@/actions/schedule'

interface Team {
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
    status: string
    cancellationReason: string | null
  }
  teams: Team[]
  onClose: () => void
  onDeleted: () => void
  onStatusChanged?: (gameId: string, newStatus: string, reason: string | null) => void
}

function toLocalDatetimeValue(utcIso: string): string {
  const d = new Date(utcIso)
  // Format as YYYY-MM-DDTHH:mm for datetime-local input (browser local time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EditGameModal({ game, teams, onClose, onDeleted, onStatusChanged }: Props) {
  const [homeTeamId, setHomeTeamId] = useState(game.homeTeamId ?? '')
  const [awayTeamId, setAwayTeamId] = useState(game.awayTeamId ?? '')
  const [homeTeamLabel, setHomeTeamLabel] = useState(game.homeTeamLabel ?? '')
  const [awayTeamLabel, setAwayTeamLabel] = useState(game.awayTeamLabel ?? '')
  const [scheduledAt, setScheduledAt] = useState(toLocalDatetimeValue(game.scheduledAt))
  const [court, setCourt] = useState(game.court ?? '')
  const [weekNumber, setWeekNumber] = useState(game.weekNumber?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

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
        scheduledAt: new Date(scheduledAt).toISOString(),
        court: court || undefined,
        weekNumber: weekNumber ? Number(weekNumber) : undefined,
      })
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
      }
    })
  }

  function handleDelete() {
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

  function handleRestoreGame() {
    startTransition(async () => {
      const result = await restoreGame({ gameId: game.id, leagueId: game.leagueId, notify: notifyTeams })
      if (result.error) { setError(result.error) } else { setGameStatus('scheduled'); setStatusReason(''); onStatusChanged?.(game.id, 'scheduled', null) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 my-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-base">Edit Game</h2>
            {gameStatus === 'cancelled' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>
            )}
            {gameStatus === 'postponed' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Postponed</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date & Time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Home Team</label>
            <select
              value={homeTeamId}
              onChange={(e) => { setHomeTeamId(e.target.value); if (e.target.value) setHomeTeamLabel('') }}
              className="w-full border rounded px-2 py-1.5 text-sm"
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
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm text-gray-600"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Away Team</label>
            <select
              value={awayTeamId}
              onChange={(e) => { setAwayTeamId(e.target.value); if (e.target.value) setAwayTeamLabel('') }}
              className="w-full border rounded px-2 py-1.5 text-sm"
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
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm text-gray-600"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Court</label>
              <input
                type="text"
                value={court}
                onChange={(e) => setCourt(e.target.value)}
                placeholder="e.g. A"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Week #</label>
              <input
                type="number"
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value)}
                min={1}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

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
                    className="flex-1 py-1.5 rounded text-xs font-medium border border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    Postpone
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusAction('cancel')}
                    className="flex-1 py-1.5 rounded text-xs font-medium border border-red-300 text-red-600 hover:bg-red-50"
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
                    className="w-full border rounded px-2 py-1.5 text-xs text-gray-700"
                  />
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={notifyTeams} onChange={(e) => setNotifyTeams(e.target.checked)} className="rounded" />
                    Notify both teams by email
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={statusAction === 'cancel' ? handleCancelGame : handlePostponeGame}
                      disabled={isPending}
                      className={`flex-1 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50 ${statusAction === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
                    >
                      {isPending ? 'Saving…' : statusAction === 'cancel' ? 'Yes, Cancel' : 'Yes, Postpone'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStatusAction(null); setStatusReason('') }}
                      className="flex-1 py-1.5 rounded text-xs font-medium border text-gray-600 hover:bg-gray-50"
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
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={notifyTeams} onChange={(e) => setNotifyTeams(e.target.checked)} className="rounded" />
                Notify both teams when restoring
              </label>
              <button
                type="button"
                onClick={handleRestoreGame}
                disabled={isPending}
                className="w-full py-1.5 rounded text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                {isPending ? 'Restoring…' : 'Restore Game'}
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-xs text-red-700 font-medium">Delete this game and its result?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="flex-1 py-1.5 rounded text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {isPending ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-1.5 rounded text-xs font-medium border text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-500 hover:text-red-700 hover:underline"
            >
              Delete game
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
