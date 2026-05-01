'use client'

import { useState, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  /** Compact mode: renders as a full-width action button (used in mobile card rows) */
  compact?: boolean
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

// ── Score entry bottom sheet ───────────────────────────────────────────────────

function ScoreEntrySheet({
  gameId, leagueId, sport, homeTeamName, awayTeamName, existingResult, onClose,
}: Props & { onClose: () => void }) {
  const isSetBased = SET_SPORTS.has(sport ?? '')

  const [homeScore, setHomeScore] = useState(existingResult?.homeScore ?? 0)
  const [awayScore, setAwayScore] = useState(existingResult?.awayScore ?? 0)
  const [sets, setSets] = useState<SetScore[]>(() =>
    isSetBased
      ? (existingResult?.sets?.length ? existingResult.sets : emptySets(2))
      : []
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Escape to close
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  function updateSet(i: number, side: 'home' | 'away', val: number) {
    setSets((prev) => prev.map((s, idx) => idx === i ? { ...s, [side]: Math.max(0, val) } : s))
  }

  function submit() {
    setError(null)
    let finalHome: number
    let finalAway: number
    let finalSets: SetScore[] | undefined

    if (isSetBased) {
      const [h, a] = setsWon(sets)
      finalHome = h
      finalAway = a
      finalSets = sets
    } else {
      finalHome = homeScore
      finalAway = awayScore
      finalSets = undefined
    }

    startTransition(async () => {
      const result = await adminSetScore({ gameId, leagueId, homeScore: finalHome, awayScore: finalAway, sets: finalSets })
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
      }
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Drag handle — mobile only */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pt-3 pb-6 space-y-5">
          {/* Header */}
          <div>
            <h3 className="font-semibold text-base text-gray-900">Enter score</h3>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{homeTeamName} vs {awayTeamName}</p>
          </div>

          {isSetBased ? (
            /* Volleyball: set-by-set inputs */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <span className="w-10 text-center">Set</span>
                <span className="flex-1 text-center truncate">{homeTeamName}</span>
                <span className="w-4" />
                <span className="flex-1 text-center truncate">{awayTeamName}</span>
              </div>
              {sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-10 text-center font-semibold">{i + 1}</span>
                  <div className="flex-1 flex justify-center">
                    <input
                      type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                      value={s.home}
                      onChange={(e) => updateSet(i, 'home', parseInt(e.target.value) || 0)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                      className="w-16 h-12 border-2 rounded-xl text-2xl font-bold tabular-nums text-center focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <span className="text-gray-300 font-bold text-lg w-4 text-center">–</span>
                  <div className="flex-1 flex justify-center">
                    <input
                      type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                      value={s.away}
                      onChange={(e) => updateSet(i, 'away', parseInt(e.target.value) || 0)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                      className="w-16 h-12 border-2 rounded-xl text-2xl font-bold tabular-nums text-center focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  {sets.length > 1 && (
                    <button type="button" onClick={() => setSets((p) => p.filter((_, j) => j !== i))}
                      className="w-6 text-gray-300 hover:text-red-400 text-xl text-center">×</button>
                  )}
                </div>
              ))}
              {sets.length < MAX_SETS && (
                <button type="button" onClick={() => setSets((p) => [...p, { home: 0, away: 0 }])}
                  className="text-sm text-blue-600 hover:underline pl-10">
                  + Add set {sets.length + 1}
                </button>
              )}
              {(() => {
                const [h, a] = setsWon(sets)
                return (
                  <p className="text-sm text-gray-500 pl-10">
                    Sets won: <span className="font-semibold tabular-nums">{h} – {a}</span>
                  </p>
                )
              })()}
            </div>
          ) : (
            /* Non-volleyball: large stepper inputs */
            <div className="flex items-start justify-around gap-2 py-1">
              {/* Home */}
              <div className="flex flex-col items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate max-w-[100px] text-center">{homeTeamName}</span>
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => setHomeScore((v) => Math.max(0, v - 1))}
                    className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-transform flex items-center justify-center select-none">−</button>
                  <input
                    type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                    value={homeScore}
                    onChange={(e) => setHomeScore(Math.max(0, parseInt(e.target.value) || 0))}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                    className="w-14 text-4xl font-bold tabular-nums text-center border-0 outline-none bg-transparent"
                  />
                  <button type="button"
                    onClick={() => setHomeScore((v) => v + 1)}
                    className="w-10 h-10 rounded-full text-white text-xl font-bold active:scale-95 transition-transform flex items-center justify-center select-none"
                    style={{ backgroundColor: 'var(--brand-primary)' }}>+</button>
                </div>
              </div>

              <div className="text-3xl font-bold text-gray-200 mt-8 shrink-0">–</div>

              {/* Away */}
              <div className="flex flex-col items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate max-w-[100px] text-center">{awayTeamName}</span>
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => setAwayScore((v) => Math.max(0, v - 1))}
                    className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-transform flex items-center justify-center select-none">−</button>
                  <input
                    type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                    value={awayScore}
                    onChange={(e) => setAwayScore(Math.max(0, parseInt(e.target.value) || 0))}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                    className="w-14 text-4xl font-bold tabular-nums text-center border-0 outline-none bg-transparent"
                  />
                  <button type="button"
                    onClick={() => setAwayScore((v) => v + 1)}
                    className="w-10 h-10 rounded-full text-white text-xl font-bold active:scale-95 transition-transform flex items-center justify-center select-none"
                    style={{ backgroundColor: 'var(--brand-primary)' }}>+</button>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={submit} disabled={isPending}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}>
              {isPending ? 'Saving…' : 'Save score'}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm border text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function AdminScoreEntry({ gameId, leagueId, sport, homeTeamName, awayTeamName, existingResult, compact }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const hasScore =
    existingResult?.homeScore !== null && existingResult?.homeScore !== undefined &&
    existingResult?.awayScore !== null && existingResult?.awayScore !== undefined

  return (
    <>
      {sheetOpen && (
        <ScoreEntrySheet
          gameId={gameId}
          leagueId={leagueId}
          sport={sport}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          existingResult={existingResult}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {/* Compact mode: full-width action button for mobile card rows */}
      {compact ? (
        <button
          onClick={() => setSheetOpen(true)}
          className="w-full py-2.5 text-xs font-semibold text-center hover:bg-gray-50 active:bg-gray-100 transition-colors"
          style={{ color: 'var(--brand-primary)' }}
        >
          {hasScore ? 'Edit score' : 'Enter score →'}
        </button>
      ) : hasScore ? (
        <button onClick={() => setSheetOpen(true)} className="group text-left" title="Click to edit score">
          <span className="font-bold tabular-nums text-sm">
            {existingResult!.homeScore} – {existingResult!.awayScore}
          </span>
          {existingResult?.sets && existingResult.sets.length > 0 && (
            <span className="ml-1.5 text-[10px] text-gray-400">
              ({existingResult.sets.map((s) => `${s.home}–${s.away}`).join(', ')})
            </span>
          )}
          {existingResult?.status === 'confirmed' ? (
            <span className="ml-1.5 text-[10px] font-medium text-green-600 bg-green-50 px-1 py-0.5 rounded">✓ confirmed</span>
          ) : (
            <span className="ml-1.5 text-[10px] font-medium text-amber-600 bg-amber-50 px-1 py-0.5 rounded">pending</span>
          )}
          <span className="ml-1 text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
        </button>
      ) : (
        <button onClick={() => setSheetOpen(true)}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">
          Enter Score
        </button>
      )}
    </>
  )
}
