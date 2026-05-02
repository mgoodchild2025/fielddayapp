'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { insertBreak } from '@/actions/schedule'

interface Props {
  leagueId: string
  /** Array of scheduled_at UTC ISO strings for all existing games (for preview count) */
  gameTimes: string[]
}

export function InsertBreakForm({ leagueId, gameTimes }: Props) {
  const router = useRouter()
  const [breakAt, setBreakAt] = useState('')
  const [duration, setDuration] = useState(60)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Count how many games would shift (scheduled_at >= breakAt)
  const affectedCount = useMemo(() => {
    if (!breakAt) return 0
    const breakUtc = new Date(breakAt).toISOString()
    return gameTimes.filter(t => t >= breakUtc).length
  }, [breakAt, gameTimes])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!breakAt || duration <= 0) return

    setLoading(true)
    setSuccess(null)
    setError(null)

    const breakAtUtc = new Date(breakAt).toISOString()
    const result = await insertBreak({ leagueId, breakAt: breakAtUtc, durationMinutes: duration })

    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else if (result.count === 0) {
      setError('No games found at or after that time.')
    } else {
      setSuccess(`${result.count} game${result.count !== 1 ? 's' : ''} shifted forward by ${duration} min.`)
      setBreakAt('')
      setDuration(60)
      router.refresh()
    }
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold mb-1 text-sm">Insert Break</h3>
      <p className="text-xs text-gray-500 mb-3">
        Games at or after the break time will shift forward by the break duration.
      </p>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs mb-3">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs mb-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Break starts at</label>
          <input
            type="datetime-local"
            value={breakAt}
            onChange={e => setBreakAt(e.target.value)}
            required
            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Break duration (min)</label>
          <input
            type="number"
            min={1}
            value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            required
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>

        {breakAt && (
          <p className="text-xs text-gray-500">
            {affectedCount === 0
              ? 'No games will be affected.'
              : `${affectedCount} game${affectedCount !== 1 ? 's' : ''} will shift forward by ${duration} min.`}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !breakAt || duration <= 0 || affectedCount === 0}
          className="w-full py-2 rounded text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Applying…' : 'Insert Break'}
        </button>
      </form>
    </div>
  )
}
