'use client'

import { useState } from 'react'
import { adminSetScore } from '@/actions/scores'

interface Props {
  gameId: string
  leagueId: string
  homeTeamName: string
  awayTeamName: string
  existingResult?: {
    homeScore: number | null
    awayScore: number | null
    status: string
  } | null
}

export function AdminScoreEntry({ gameId, leagueId, homeTeamName, awayTeamName, existingResult }: Props) {
  const [open, setOpen] = useState(false)
  const [homeScore, setHomeScore] = useState<number>(existingResult?.homeScore ?? 0)
  const [awayScore, setAwayScore] = useState<number>(existingResult?.awayScore ?? 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasScore =
    existingResult?.homeScore !== null &&
    existingResult?.homeScore !== undefined &&
    existingResult?.awayScore !== null &&
    existingResult?.awayScore !== undefined

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await adminSetScore({
      gameId,
      leagueId,
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
    })
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setOpen(false)
    }
  }

  if (open) {
    return (
      <div className="space-y-1.5">
        <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-gray-400 mb-0.5 truncate max-w-[52px]">{homeTeamName}</span>
            <input
              type="number"
              min={0}
              value={homeScore}
              onChange={(e) => setHomeScore(Number(e.target.value))}
              className="w-14 border rounded px-1 py-1 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <span className="text-gray-300 font-bold text-lg mt-3">–</span>
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-gray-400 mb-0.5 truncate max-w-[52px]">{awayTeamName}</span>
            <input
              type="number"
              min={0}
              value={awayScore}
              onChange={(e) => setAwayScore(Number(e.target.value))}
              className="w-14 border rounded px-1 py-1 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1 mt-3">
            <button
              type="submit"
              disabled={loading}
              className="px-2 py-1 text-xs rounded font-semibold text-white disabled:opacity-50 leading-none"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {loading ? '…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1 text-xs rounded font-medium text-gray-400 border hover:bg-gray-50 leading-none"
            >
              Cancel
            </button>
          </div>
        </form>
        {error && <p className="text-red-500 text-xs">{error}</p>}
      </div>
    )
  }

  if (hasScore) {
    return (
      <button
        onClick={() => {
          setHomeScore(existingResult!.homeScore!)
          setAwayScore(existingResult!.awayScore!)
          setOpen(true)
        }}
        className="group text-left"
        title="Click to edit score"
      >
        <span className="font-bold tabular-nums text-sm">
          {existingResult!.homeScore} – {existingResult!.awayScore}
        </span>
        {existingResult?.status === 'confirmed' ? (
          <span className="ml-1.5 text-[10px] font-medium text-green-600 bg-green-50 px-1 py-0.5 rounded">✓ confirmed</span>
        ) : (
          <span className="ml-1.5 text-[10px] font-medium text-amber-600 bg-amber-50 px-1 py-0.5 rounded">pending</span>
        )}
        <span className="ml-1 text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
      </button>
    )
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
    >
      Enter Score
    </button>
  )
}
