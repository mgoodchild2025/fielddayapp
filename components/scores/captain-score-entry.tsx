'use client'

import { useState } from 'react'
import { submitScore, confirmScore } from '@/actions/scores'

const SET_SPORTS    = new Set(['volleyball', 'beach_volleyball'])
const PERIOD_SPORTS = new Set(['hockey'])
const INNING_SPORTS = new Set(['baseball', 'softball'])

type ScoringMode = 'sets' | 'periods' | 'innings' | 'simple'

function getScoringMode(sport?: string): ScoringMode {
  if (SET_SPORTS.has(sport ?? ''))    return 'sets'
  if (PERIOD_SPORTS.has(sport ?? '')) return 'periods'
  if (INNING_SPORTS.has(sport ?? '')) return 'innings'
  return 'simple'
}

function segmentLabel(mode: ScoringMode, i: number): string {
  if (mode === 'periods') {
    if (i < 3) return `P${i + 1}`
    if (i === 3) return 'OT'
    return `${i - 2}OT`
  }
  return String(i + 1)
}

function segmentName(mode: ScoringMode): string {
  if (mode === 'periods') return 'Period'
  if (mode === 'innings') return 'Inning'
  return 'Set'
}

function defaultSegments(mode: ScoringMode): SetScore[] {
  const n = mode === 'innings' ? 9 : mode === 'periods' ? 3 : 1
  return Array.from({ length: n }, () => ({ home: 0, away: 0 }))
}

function canAddMore(mode: ScoringMode, count: number): boolean {
  if (mode === 'sets')    return count < 3
  if (mode === 'periods') return count < 5   // P1–P3 + OT + 2OT
  if (mode === 'innings') return count < 20  // extra innings
  return false
}

function addButtonLabel(mode: ScoringMode, count: number): string {
  if (mode === 'sets')    return `+ Add set ${count + 1}`
  if (mode === 'periods') return count === 3 ? '+ Add overtime' : `+ Add ${count - 2}OT`
  return `+ Add extra inning ${count + 1}`
}

function calcFinalScore(mode: ScoringMode, segs: SetScore[]): [number, number] {
  if (mode === 'sets') return setsWon(segs)
  return segs.reduce<[number, number]>(([h, a], s) => [h + s.home, a + s.away], [0, 0])
}

function scoreSummaryLabel(mode: ScoringMode): string {
  if (mode === 'periods') return 'Goals'
  if (mode === 'innings') return 'Runs'
  return 'Sets won'
}

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
  const scoringMode = getScoringMode(sport)
  const isSegmented = scoringMode !== 'simple'

  const initialSegs: SetScore[] = isSegmented
    ? (existingResult?.sets && existingResult.sets.length > 0
        ? existingResult.sets
        : defaultSegments(scoringMode))
    : []

  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState<SetScore[]>(initialSegs)
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
    if (isSegmented) {
      setSets(existingResult?.sets && existingResult.sets.length > 0
        ? existingResult.sets
        : defaultSegments(scoringMode))
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
    if (canAddMore(scoringMode, sets.length)) setSets(prev => [...prev, { home: 0, away: 0 }])
  }

  function removeSet(i: number) {
    if (sets.length > 1) setSets(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    let finalHome: number, finalAway: number, finalSets: SetScore[] | undefined

    if (isSegmented) {
      const [h, a] = calcFinalScore(scoringMode, sets)
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
          {isSegmented ? (
            <div className="space-y-2">
              {/* Column headers */}
              <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                <span className="w-10 text-center">{segmentName(scoringMode)}</span>
                <span className="w-16 text-center truncate">{homeTeamName}</span>
                <span className="w-4" />
                <span className="w-16 text-center truncate">{awayTeamName}</span>
              </div>

              {sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-10 text-center">{segmentLabel(scoringMode, i)}</span>
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
                  {sets.length > 1 && scoringMode !== 'innings' && (
                    <button type="button" onClick={() => removeSet(i)}
                      className="text-gray-300 hover:text-red-400 text-xl leading-none">×</button>
                  )}
                </div>
              ))}

              {canAddMore(scoringMode, sets.length) && (
                <button type="button" onClick={addSet}
                  className="text-xs text-blue-500 hover:underline ml-10">
                  {addButtonLabel(scoringMode, sets.length)}
                </button>
              )}

              <p className="text-[10px] text-gray-400 ml-10">
                {(() => {
                  const [h, a] = calcFinalScore(scoringMode, sets)
                  return `${scoreSummaryLabel(scoringMode)}: ${homeTeamName} ${h} – ${a} ${awayTeamName}`
                })()}
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
