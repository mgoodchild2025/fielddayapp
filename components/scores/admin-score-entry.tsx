'use client'

import { useState, useTransition } from 'react'
import { Overlay } from '@/components/ui/overlay'
import { adminSetScore, adminClearScore, recordForfeit } from '@/actions/scores'
import { toast } from 'sonner'

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

function scoreSummaryLabel(mode: ScoringMode): string {
  if (mode === 'periods') return 'Goals'
  if (mode === 'innings') return 'Runs'
  return 'Sets won'
}

// SetScore — numeric, used in Props (data from DB)
interface SetScore { home: number; away: number }
// EditSet — string, used in local editing state (allows empty field while typing)
type EditSet = { home: string; away: string }

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
  /** With compact: a big filled button (Courtside) instead of the flat strip
   *  that sits in the phone schedule card's toolbar. */
  large?: boolean
}

function defaultSegments(mode: ScoringMode): EditSet[] {
  const n = mode === 'innings' ? 9 : mode === 'periods' ? 3 : 2
  return Array.from({ length: n }, () => ({ home: '', away: '' }))
}

function parseScore(v: string): number {
  const n = parseInt(v || '0')
  return isNaN(n) ? 0 : Math.max(0, n)
}

function setsWon(sets: EditSet[]): [number, number] {
  let h = 0, a = 0
  for (const s of sets) {
    const sh = parseScore(s.home)
    const sa = parseScore(s.away)
    if (sh > sa) h++
    else if (sa > sh) a++
  }
  return [h, a]
}

// ── Score entry bottom sheet ───────────────────────────────────────────────────

function ScoreEntrySheet({
  gameId, leagueId, sport, homeTeamName, awayTeamName, existingResult, onClose,
}: Props & { onClose: () => void }) {
  const scoringMode = getScoringMode(sport)
  const isSegmented = scoringMode !== 'simple'

  const [homeScore, setHomeScore] = useState<string>(
    existingResult?.homeScore != null ? String(existingResult.homeScore) : ''
  )
  const [awayScore, setAwayScore] = useState<string>(
    existingResult?.awayScore != null ? String(existingResult.awayScore) : ''
  )
  const [sets, setSets] = useState<EditSet[]>(() => {
    if (!isSegmented) return []
    if (existingResult?.sets?.length) {
      return existingResult.sets.map((s) => ({ home: String(s.home), away: String(s.away) }))
    }
    return defaultSegments(scoringMode)
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmClear, setConfirmClear] = useState(false)
  const [forfeitOpen, setForfeitOpen] = useState(false)

  function applyForfeit(forfeitSide: 'home' | 'away' | 'both') {
    setError(null)
    startTransition(async () => {
      const result = await recordForfeit({ gameId, leagueId, forfeitSide })
      if (result.error) setError(result.error)
      else {
        onClose()
        toast.success(`Forfeit recorded · ${homeTeamName} vs ${awayTeamName}`)
      }
    })
  }

  // Scroll lock, Escape and focus come from the Overlay this renders inside.

  function updateSet(i: number, side: 'home' | 'away', val: string) {
    setSets((prev) => prev.map((s, idx) => idx === i ? { ...s, [side]: val } : s))
  }

  // Adds an empty set to the list (called from the "+ Add set" button)
  function addSet() {
    setSets((p) => [...p, { home: '', away: '' }])
  }

  const hasExistingScore =
    existingResult?.homeScore != null && existingResult?.awayScore != null

  function clearScore() {
    setError(null)
    startTransition(async () => {
      const result = await adminClearScore(gameId)
      if (result.error) {
        setError(result.error)
        setConfirmClear(false)
      } else {
        onClose()
        toast.success(`Score cleared · ${homeTeamName} vs ${awayTeamName}`)
      }
    })
  }

  function submit() {
    setError(null)
    let finalHome: number
    let finalAway: number
    let finalSets: { home: number; away: number }[] | undefined

    if (isSegmented) {
      const numericSegs = sets.map((s) => ({ home: parseScore(s.home), away: parseScore(s.away) }))
      if (scoringMode === 'sets') {
        const [h, a] = setsWon(sets)
        finalHome = h
        finalAway = a
      } else {
        // periods & innings: final score = sum of all segments
        finalHome = numericSegs.reduce((sum, s) => sum + s.home, 0)
        finalAway = numericSegs.reduce((sum, s) => sum + s.away, 0)
      }
      finalSets = numericSegs
    } else {
      finalHome = parseScore(homeScore)
      finalAway = parseScore(awayScore)
      finalSets = undefined
    }

    startTransition(async () => {
      const result = await adminSetScore({ gameId, leagueId, homeScore: finalHome, awayScore: finalAway, sets: finalSets })
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
        // The sheet closing (and Courtside re-sorting the card into "Scored")
        // was the only sign it worked.
        toast.success(`Saved ${finalHome}–${finalAway} · ${homeTeamName} vs ${awayTeamName}`)
      }
    })
  }

  return (
      <>
        {/* Drag handle — mobile only */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Scrolls on its own: nine innings (or a forfeit panel) is taller than
            a phone, and Save lives in the pinned footer below. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-3 pb-5 space-y-5">
          {/* Header */}
          <div>
            <h3 className="font-semibold text-base text-gray-900">Enter score</h3>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{homeTeamName} vs {awayTeamName}</p>
          </div>

          {isSegmented ? (
            /* Volleyball sets / Hockey periods / Baseball innings */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <span className="w-10 text-center">{segmentName(scoringMode)}</span>
                <span className="flex-1 text-center truncate">{homeTeamName}</span>
                <span className="w-4" />
                <span className="flex-1 text-center truncate">{awayTeamName}</span>
              </div>
              {sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-10 text-center font-semibold">
                    {segmentLabel(scoringMode, i)}
                  </span>
                  <div className="flex-1 flex justify-center">
                    <input
                      type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                      value={s.home}
                      placeholder="0"
                      onChange={(e) => updateSet(i, 'home', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                      className="w-16 h-12 border-2 rounded-xl text-2xl font-bold tabular-nums text-center focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  <span className="text-gray-300 font-bold text-lg w-4 text-center">–</span>
                  <div className="flex-1 flex justify-center">
                    <input
                      type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                      value={s.away}
                      placeholder="0"
                      onChange={(e) => updateSet(i, 'away', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                      className="w-16 h-12 border-2 rounded-xl text-2xl font-bold tabular-nums text-center focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  {sets.length > 1 && scoringMode !== 'innings' && (
                    <button type="button" onClick={() => setSets((p) => p.filter((_, j) => j !== i))}
                      className="w-6 text-gray-300 hover:text-red-400 text-xl text-center">×</button>
                  )}
                </div>
              ))}
              {canAddMore(scoringMode, sets.length) && (
                <button type="button" onClick={addSet}
                  className="text-sm text-blue-600 hover:underline pl-10">
                  {addButtonLabel(scoringMode, sets.length)}
                </button>
              )}
              {(() => {
                const numericSegs = sets.map(s => ({ home: parseScore(s.home), away: parseScore(s.away) }))
                const [h, a] = scoringMode === 'sets'
                  ? setsWon(sets)
                  : [numericSegs.reduce((sum, s) => sum + s.home, 0), numericSegs.reduce((sum, s) => sum + s.away, 0)]
                return (
                  <p className="text-sm text-gray-500 pl-10">
                    {scoreSummaryLabel(scoringMode)}: <span className="font-semibold tabular-nums">{h} – {a}</span>
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
                    onClick={() => setHomeScore((v) => String(Math.max(0, parseInt(v || '0') - 1)))}
                    className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-transform flex items-center justify-center select-none">−</button>
                  <input
                    type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                    value={homeScore}
                    placeholder="0"
                    onChange={(e) => setHomeScore(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                    className="w-14 text-4xl font-bold tabular-nums text-center border-0 bg-transparent rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  />
                  <button type="button"
                    onClick={() => setHomeScore((v) => String(parseInt(v || '0') + 1))}
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
                    onClick={() => setAwayScore((v) => String(Math.max(0, parseInt(v || '0') - 1)))}
                    className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-transform flex items-center justify-center select-none">−</button>
                  <input
                    type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                    value={awayScore}
                    placeholder="0"
                    onChange={(e) => setAwayScore(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                    className="w-14 text-4xl font-bold tabular-nums text-center border-0 bg-transparent rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  />
                  <button type="button"
                    onClick={() => setAwayScore((v) => String(parseInt(v || '0') + 1))}
                    className="w-10 h-10 rounded-full text-white text-xl font-bold active:scale-95 transition-transform flex items-center justify-center select-none"
                    style={{ backgroundColor: 'var(--brand-primary)' }}>+</button>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Forfeit — for a no-show. Auto-fills a default win/loss score. */}
          <div className="border-t pt-3">
            {!forfeitOpen ? (
              <button type="button" onClick={() => { setForfeitOpen(true); setError(null) }}
                className="text-xs font-medium text-gray-500 hover:text-gray-700">
                A team didn&apos;t show? Record a forfeit →
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Who forfeited?</p>
                <button type="button" onClick={() => applyForfeit('home')} disabled={isPending}
                  className="w-full py-2 rounded-lg text-sm font-medium border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50 text-left px-3">
                  {homeTeamName} forfeited <span className="text-amber-500">— {awayTeamName} wins</span>
                </button>
                <button type="button" onClick={() => applyForfeit('away')} disabled={isPending}
                  className="w-full py-2 rounded-lg text-sm font-medium border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50 text-left px-3">
                  {awayTeamName} forfeited <span className="text-amber-500">— {homeTeamName} wins</span>
                </button>
                <button type="button" onClick={() => applyForfeit('both')} disabled={isPending}
                  className="w-full py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-left px-3">
                  Double forfeit <span className="text-gray-400">— loss for both, no winner</span>
                </button>
                <button type="button" onClick={() => setForfeitOpen(false)}
                  className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            )}
          </div>

          {hasExistingScore && (
            <div className="border-t pt-3">
              {confirmClear ? (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-500 flex-1">Reset game to no score?</p>
                  <button type="button" onClick={clearScore} disabled={isPending}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50">
                    {isPending ? 'Clearing…' : 'Confirm'}
                  </button>
                  <button type="button" onClick={() => setConfirmClear(false)}
                    className="text-xs text-gray-400 hover:text-gray-600">
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmClear(true)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                  Clear score
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pinned footer: Save is always reachable (the sheet pads for the home indicator). */}
        <div className="shrink-0 border-t bg-white px-5 pt-3 pb-3 flex gap-2">
          <button type="button" onClick={submit} disabled={isPending}
            className="press flex-1 min-h-12 rounded-xl text-base font-semibold bg-brand-primary text-on-brand disabled:opacity-50">
            {isPending ? 'Saving…' : 'Save score'}
          </button>
          <button type="button" onClick={onClose}
            className="press flex-1 min-h-12 rounded-xl text-base border text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </>
  )
}

// A captain submitted this score and the other captain hasn't confirmed it:
// the admin can confirm it as-is in one tap (adminSetScore saves it confirmed).
function ConfirmPendingButton({ gameId, leagueId, homeTeamName, awayTeamName, result }: {
  gameId: string
  leagueId: string
  homeTeamName: string
  awayTeamName: string
  result: NonNullable<Props['existingResult']>
}) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await adminSetScore({
            gameId, leagueId,
            homeScore: result.homeScore ?? 0,
            awayScore: result.awayScore ?? 0,
            sets: result.sets ?? undefined,
          })
          if (res.error) toast.error(res.error)
          else toast.success(`Confirmed ${result.homeScore}–${result.awayScore} · ${homeTeamName} vs ${awayTeamName}`)
        })
      }
      className="press flex-1 min-h-12 rounded-lg text-base font-semibold bg-brand-primary text-on-brand disabled:opacity-50"
    >
      {isPending ? 'Confirming…' : `✓ Confirm ${result.homeScore}–${result.awayScore}`}
    </button>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function AdminScoreEntry({ gameId, leagueId, sport, homeTeamName, awayTeamName, existingResult, compact, large }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const hasScore =
    existingResult?.homeScore !== null && existingResult?.homeScore !== undefined &&
    existingResult?.awayScore !== null && existingResult?.awayScore !== undefined

  return (
    <>
      <Overlay
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        variant="sheet"
        label={`Score: ${homeTeamName} vs ${awayTeamName}`}
        panelClassName="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90dvh]"
      >
        <ScoreEntrySheet
          gameId={gameId}
          leagueId={leagueId}
          sport={sport}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          existingResult={existingResult}
          onClose={() => setSheetOpen(false)}
        />
      </Overlay>

      {/* Compact mode: full-width action button for mobile card rows (Courtside,
          the phone schedule). A captain-submitted score gets a one-tap Confirm. */}
      {compact && !large ? (
        <button
          onClick={() => setSheetOpen(true)}
          className="press w-full min-h-11 text-sm font-semibold text-center text-brand-primary hover:bg-gray-50 active:bg-gray-100"
        >
          {hasScore ? 'Edit score' : 'Enter score →'}
        </button>
      ) : compact ? (
        existingResult?.status === 'pending' && hasScore ? (
          <div className="flex gap-2">
            <ConfirmPendingButton
              gameId={gameId}
              leagueId={leagueId}
              homeTeamName={homeTeamName}
              awayTeamName={awayTeamName}
              result={existingResult}
            />
            <button
              onClick={() => setSheetOpen(true)}
              className="press min-h-12 px-4 rounded-lg border text-base font-semibold text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSheetOpen(true)}
            className={`press w-full min-h-12 rounded-lg text-base font-semibold ${
              hasScore ? 'border text-gray-700 hover:bg-gray-50' : 'bg-brand-primary text-on-brand'
            }`}
          >
            {hasScore ? 'Edit score' : 'Enter score →'}
          </button>
        )
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
