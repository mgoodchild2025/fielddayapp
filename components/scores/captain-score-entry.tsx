'use client'

import { useState } from 'react'
import { submitScore, confirmScore } from '@/actions/scores'

interface Props {
  gameId: string
  homeTeamName: string
  awayTeamName: string
  isCaptainOfHome: boolean
  isCaptainOfAway: boolean
  existingResult?: {
    homeScore: number | null
    awayScore: number | null
    status: string
    submittedByOpponent?: boolean
  } | null
}

export function CaptainScoreEntry({
  gameId,
  homeTeamName,
  awayTeamName,
  isCaptainOfHome,
  isCaptainOfAway,
  existingResult,
}: Props) {
  const [open, setOpen] = useState(false)
  const [homeScore, setHomeScore] = useState<number>(existingResult?.homeScore ?? 0)
  const [awayScore, setAwayScore] = useState<number>(existingResult?.awayScore ?? 0)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const hasScore =
    existingResult?.homeScore !== null &&
    existingResult?.homeScore !== undefined &&
    existingResult?.awayScore !== null &&
    existingResult?.awayScore !== undefined

  const isPending = existingResult?.status === 'pending'
  const isConfirmed = existingResult?.status === 'confirmed'
  const isCaptain = isCaptainOfHome || isCaptainOfAway

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await submitScore({ gameId, homeScore: Number(homeScore), awayScore: Number(awayScore) })
    setLoading(false)
    if (res.error) {
      setError(res.error)
    } else {
      setOpen(false)
    }
  }

  async function handleConfirm() {
    setConfirming(true)
    setError(null)
    const res = await confirmScore(gameId)
    setConfirming(false)
    if (res.error) {
      setError(res.error)
    } else {
      setDone(true)
    }
  }

  // If confirmed (or just confirmed by this user), nothing to show
  if (isConfirmed || done) return null

  // Not a captain — nothing to show
  if (!isCaptain) return null

  // Pending state — show confirmation UI (if opposing captain) or edit option
  if (isPending && !open) {
    return (
      <div className="mt-3 border-t pt-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-medium text-amber-700">Score submitted — awaiting confirmation</p>
            <p className="text-sm font-bold mt-0.5">
              {existingResult!.homeScore} – {existingResult!.awayScore}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {existingResult?.submittedByOpponent && (
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="px-3 py-1.5 text-xs font-semibold text-white rounded disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {confirming ? 'Confirming…' : 'Confirm Score'}
              </button>
            )}
            <button
              onClick={() => {
                setHomeScore(existingResult?.homeScore ?? 0)
                setAwayScore(existingResult?.awayScore ?? 0)
                setOpen(true)
              }}
              className="px-3 py-1.5 text-xs font-semibold border rounded text-gray-600 hover:bg-gray-50"
            >
              Edit
            </button>
          </div>
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>
    )
  }

  // Inline score entry form
  if (open) {
    return (
      <div className="mt-3 border-t pt-3">
        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Submit Score</p>
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <div className="flex flex-col items-center">
            <label className="text-[10px] text-gray-400 mb-1 truncate max-w-[64px] text-center">{homeTeamName}</label>
            <input
              type="number"
              min={0}
              value={homeScore}
              onChange={(e) => setHomeScore(Number(e.target.value))}
              className="w-16 border rounded px-2 py-1.5 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <span className="text-gray-300 font-bold text-xl mb-2">–</span>
          <div className="flex flex-col items-center">
            <label className="text-[10px] text-gray-400 mb-1 truncate max-w-[64px] text-center">{awayTeamName}</label>
            <input
              type="number"
              min={0}
              value={awayScore}
              onChange={(e) => setAwayScore(Number(e.target.value))}
              className="w-16 border rounded px-2 py-1.5 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex flex-col gap-1.5 mb-0.5">
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 text-xs font-semibold text-white rounded disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {loading ? 'Submitting…' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold border rounded text-gray-500 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>
    )
  }

  // No score yet — show the "Submit score" prompt
  if (!hasScore) {
    return (
      <div className="mt-3 border-t pt-3">
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
        >
          + Submit score
        </button>
      </div>
    )
  }

  return null
}
