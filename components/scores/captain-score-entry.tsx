'use client'

import { useState } from 'react'
import { submitScore, confirmScore } from '@/actions/scores'

const SET_SPORTS = new Set(['volleyball', 'beach_volleyball'])
const MAX_SETS = 3

interface SetScore { home: number; away: number }

interface Props {
  gameId: string
  sport?: string
  homeTeamName: string
  awayTeamName: string
  isCaptainOfHome: boolean
  isCaptainOfAway: boolean
  existingResult?: {
    homeScore: number | null
    awayScore: number | null
    status: string
    submittedByOpponent?: boolean
    sets?: SetScore[] | null
  } | null
}

function emptySets(n: number): SetScore[] {
  return Array.from({ length: n }, () => ({ home: 0, away: 0 }))
}

function setsWon(sets: SetScore[]): [number, number] {
  let h = 0, a = 0
  for (const s of sets) {
    if (s.home > s.away) h++
    else if (s.away > s.home) a++
  }
  return [h, a]
}

export function CaptainScoreEntry({
  gameId,
  sport,
  homeTeamName,
  awayTeamName,
  isCaptainOfHome,
  isCaptainOfAway,
  existingResult,
}: Props) {
  const isSetBased = SET_SPORTS.has(sport ?? '')

  const initialSets: SetScore[] = isSetBased
    ? (existingResult?.sets && existingResult.sets.length > 0
        ? existingResult.sets
        : emptySets(1))
    : []

  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState<SetScore[]>(initialSets)
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

  function openEdit() {
    if (isSetBased) {
      setSets(existingResult?.sets && existingResult.sets.length > 0
        ? existingResult.sets
        : emptySets(1))
    } else {
      setHomeScore(existingResult?.homeScore ?? 0)
      setAwayScore(existingResult?.awayScore ?? 0)
    }
    setError(null)
    setOpen(true)
  }

  function updateSet(i: number, side: 'home' | 'away', val: number) {
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [side]: val } : s))
  }

  function addSet() {
    if (sets.length < MAX_SETS) setSets(prev => [...prev, { home: 0, away: 0 }])
  }

  function removeSet(i: number) {
    if (sets.length > 1) setSets(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    let finalHome: number, finalAway: number, finalSets: SetScore[] | undefined

    if (isSetBased) {
      const [h, a] = setsWon(sets)
      finalHome = h
      finalAway = a
      finalSets = sets
    } else {
      finalHome = Number(homeScore)
      finalAway = Number(awayScore)
      finalSets = undefined
    }

    const res = await submitScore({ gameId, homeScore: finalHome, awayScore: finalAway, sets: finalSets })
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

  if (isConfirmed || done) return null
  if (!isCaptain) return null

  // ── Pending: show confirmation UI ────────────────────────────────────────────
  if (isPending && !open) {
    const existingSets = existingResult?.sets
    return (
      <div className="mt-3 border-t pt-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-medium text-amber-700">Score submitted — awaiting confirmation</p>
            <p className="text-sm font-bold mt-0.5">
              {existingResult!.homeScore} – {existingResult!.awayScore}
              {existingSets && existingSets.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({existingSets.map(s => `${s.home}–${s.away}`).join(', ')})
                </span>
              )}
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
              onClick={openEdit}
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

  // ── Score entry form ─────────────────────────────────────────────────────────
  if (open) {
    return (
      <div className="mt-3 border-t pt-3">
        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Submit Score</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          {isSetBased ? (
            <div className="space-y-2">
              {/* Column headers */}
              <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                <span className="w-10 text-center">Set</span>
                <span className="w-16 text-center truncate">{homeTeamName}</span>
                <span className="w-4" />
                <span className="w-16 text-center truncate">{awayTeamName}</span>
              </div>

              {sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-10 text-center">{i + 1}</span>
                  <input
                    type="number" min={0} value={s.home}
                    onChange={(e) => updateSet(i, 'home', Number(e.target.value))}
                    className="w-16 border rounded px-2 py-1.5 text-center text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <span className="text-gray-300 font-bold text-lg w-4 text-center">–</span>
                  <input
                    type="number" min={0} value={s.away}
                    onChange={(e) => updateSet(i, 'away', Number(e.target.value))}
                    className="w-16 border rounded px-2 py-1.5 text-center text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  {sets.length > 1 && (
                    <button type="button" onClick={() => removeSet(i)}
                      className="text-gray-300 hover:text-red-400 text-xl leading-none">×</button>
                  )}
                </div>
              ))}

              {sets.length < MAX_SETS && (
                <button type="button" onClick={addSet}
                  className="text-xs text-blue-500 hover:underline ml-10">
                  + Add set {sets.length + 1}
                </button>
              )}

              <p className="text-[10px] text-gray-400 ml-10">
                {(() => { const [h, a] = setsWon(sets); return `Sets won: ${homeTeamName} ${h} – ${a} ${awayTeamName}` })()}
              </p>
            </div>
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex flex-col items-center">
                <label className="text-[10px] text-gray-400 mb-1 truncate max-w-[64px] text-center">{homeTeamName}</label>
                <input
                  type="number" min={0} value={homeScore}
                  onChange={(e) => setHomeScore(Number(e.target.value))}
                  className="w-16 border rounded px-2 py-1.5 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <span className="text-gray-300 font-bold text-xl mb-2">–</span>
              <div className="flex flex-col items-center">
                <label className="text-[10px] text-gray-400 mb-1 truncate max-w-[64px] text-center">{awayTeamName}</label>
                <input
                  type="number" min={0} value={awayScore}
                  onChange={(e) => setAwayScore(Number(e.target.value))}
                  className="w-16 border rounded px-2 py-1.5 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit" disabled={loading}
              className="px-3 py-1.5 text-xs font-semibold text-white rounded disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {loading ? 'Submitting…' : 'Submit'}
            </button>
            <button
              type="button" onClick={() => setOpen(false)}
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

  // ── No score yet ─────────────────────────────────────────────────────────────
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
