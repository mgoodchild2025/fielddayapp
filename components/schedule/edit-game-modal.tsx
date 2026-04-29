'use client'

import { useState, useTransition } from 'react'
import { updateGame, deleteGame } from '@/actions/schedule'

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
    scheduledAt: string
    court: string | null
    weekNumber: number | null
  }
  teams: Team[]
  onClose: () => void
  onDeleted: () => void
}

function toLocalDatetimeValue(utcIso: string): string {
  const d = new Date(utcIso)
  // Format as YYYY-MM-DDTHH:mm for datetime-local input (browser local time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EditGameModal({ game, teams, onClose, onDeleted }: Props) {
  const [homeTeamId, setHomeTeamId] = useState(game.homeTeamId ?? '')
  const [awayTeamId, setAwayTeamId] = useState(game.awayTeamId ?? '')
  const [scheduledAt, setScheduledAt] = useState(toLocalDatetimeValue(game.scheduledAt))
  const [court, setCourt] = useState(game.court ?? '')
  const [weekNumber, setWeekNumber] = useState(game.weekNumber?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updateGame({
        gameId: game.id,
        leagueId: game.leagueId,
        homeTeamId: homeTeamId || undefined,
        awayTeamId: awayTeamId || undefined,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-base">Edit Game</h2>
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
              onChange={(e) => setHomeTeamId(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">TBD</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Away Team</label>
            <select
              value={awayTeamId}
              onChange={(e) => setAwayTeamId(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">TBD</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
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

        <div className="mt-4 pt-3 border-t">
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
