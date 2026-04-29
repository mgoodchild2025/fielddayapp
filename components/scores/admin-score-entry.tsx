'use client'

import { useState } from 'react'
import { adminSetScore } from '@/actions/scores'

const SET_SPORTS = new Set(['volleyball', 'beach_volleyball'])
const MAX_SETS = 3

interface SetScore { home: number; away: number }

interface Props {
  gameId: string
  leagueId: string
  sport?: string
  homeTeamName: string
  awayTeamName: string
  existingResult?: {
    homeScore: number | null
    awayScore: number | null
    status: string
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

export function AdminScoreEntry({ gameId, leagueId, sport, homeTeamName, awayTeamName, existingResult }: Props) {
  const isSetBased = SET_SPORTS.has(sport ?? '')

  // Initialise set state from existing result
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
  const [error, setError] = useState<string | null>(null)

  const hasScore =
    existingResult?.homeScore !== null &&
    existingResult?.homeScore !== undefined &&
    existingResult?.awayScore !== null &&
    existingResult?.awayScore !== undefined

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

    const result = await adminSetScore({
      gameId,
      leagueId,
      homeScore: finalHome,
      awayScore: finalAway,
      sets: finalSets,
    })
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setOpen(false)
    }
  }

  // ── Open entry form ──────────────────────────────────────────────────────────
  if (open) {
    return (
      <div className="space-y-2 min-w-[180px]">
        <form onSubmit={handleSubmit} className="space-y-2">
          {isSetBased ? (
            <div className="space-y-1.5">
              {/* Column headers */}
              <div className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                <span className="w-10 text-center">Set</span>
                <span className="w-12 text-center truncate">{homeTeamName}</span>
                <span className="w-3" />
                <span className="w-12 text-center truncate">{awayTeamName}</span>
                <span className="w-4" />
              </div>

              {sets.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400 w-10 text-center">{i + 1}</span>
                  <input
                    type="number" min={0} value={s.home}
                    onChange={(e) => updateSet(i, 'home', Number(e.target.value))}
                    className="w-12 border rounded px-1 py-1 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <span className="text-gray-300 font-bold text-base w-3 text-center">–</span>
                  <input
                    type="number" min={0} value={s.away}
                    onChange={(e) => updateSet(i, 'away', Number(e.target.value))}
                    className="w-12 border rounded px-1 py-1 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  {sets.length > 1 && (
                    <button type="button" onClick={() => removeSet(i)}
                      className="text-gray-300 hover:text-red-400 text-base leading-none w-4 text-center">×</button>
                  )}
                </div>
              ))}

              {sets.length < MAX_SETS && (
                <button type="button" onClick={addSet}
                  className="text-[10px] text-blue-500 hover:underline ml-10">
                  + Add set {sets.length + 1}
                </button>
              )}

              {/* Sets-won summary */}
              <div className="text-[10px] text-gray-400 ml-10">
                {(() => { const [h, a] = setsWon(sets); return `Sets won: ${h} – ${a}` })()}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-gray-400 mb-0.5 truncate max-w-[52px]">{homeTeamName}</span>
                <input
                  type="number" min={0} value={homeScore}
                  onChange={(e) => setHomeScore(Number(e.target.value))}
                  className="w-14 border rounded px-1 py-1 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <span className="text-gray-300 font-bold text-lg mt-3">–</span>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-gray-400 mb-0.5 truncate max-w-[52px]">{awayTeamName}</span>
                <input
                  type="number" min={0} value={awayScore}
                  onChange={(e) => setAwayScore(Number(e.target.value))}
                  className="w-14 border rounded px-1 py-1 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
          )}

          <div className="flex gap-1">
            <button
              type="submit" disabled={loading}
              className="px-2 py-1 text-xs rounded font-semibold text-white disabled:opacity-50 leading-none"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {loading ? '…' : 'Save'}
            </button>
            <button
              type="button" onClick={() => setOpen(false)}
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

  // ── Score display ────────────────────────────────────────────────────────────
  if (hasScore) {
    const existingSets = existingResult?.sets
    return (
      <button onClick={openEdit} className="group text-left" title="Click to edit score">
        <span className="font-bold tabular-nums text-sm">
          {existingResult!.homeScore} – {existingResult!.awayScore}
        </span>
        {existingSets && existingSets.length > 0 && (
          <span className="ml-1.5 text-[10px] text-gray-400">
            ({existingSets.map(s => `${s.home}–${s.away}`).join(', ')})
          </span>
        )}
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
    <button onClick={openEdit} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">
      Enter Score
    </button>
  )
}
