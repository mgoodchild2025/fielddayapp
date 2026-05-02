'use client'

import { getRoundName, LB_ROUND_BASE, GF_ROUND } from '@/lib/bracket'
import { recordBracketScore } from '@/actions/brackets'
import { useState, useTransition, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

export interface BracketMatchData {
  id: string
  roundNumber: number
  matchNumber: number
  team1Id: string | null
  team2Id: string | null
  team1Name: string | null
  team2Name: string | null
  /** Displayed when team1Id is null (scaffold / not yet seeded) */
  team1Label: string | null
  /** Displayed when team2Id is null (scaffold / not yet seeded) */
  team2Label: string | null
  team1Seed: number | null
  team2Seed: number | null
  isBye: boolean
  winnerTeamId: string | null
  score1: number | null
  score2: number | null
  sets: { s1: number; s2: number }[] | null
  status: 'pending' | 'ready' | 'completed' | 'bye'
  scheduledAt: string | null
  court: string | null
  notes: string | null
  winnerToMatchId: string | null
}

export interface BracketData {
  id: string
  name: string
  bracketSize: number
  bracketType: 'single_elimination' | 'double_elimination'
  thirdPlaceGame: boolean
  status: string
  matches: BracketMatchData[]
}

const VOLLEYBALL_SPORTS = ['volleyball', 'beach_volleyball']

interface Props {
  bracket: BracketData
  leagueId: string
  isAdmin?: boolean
  sport?: string
}

// ── Score entry modal ─────────────────────────────────────────────────────────

type SetScore = { s1: string; s2: string }

function ScoreModal({
  match,
  bracketId,
  leagueId,
  sport,
  onClose,
}: {
  match: BracketMatchData
  bracketId: string
  leagueId: string
  sport?: string
  onClose: () => void
}) {
  const isVolleyball = VOLLEYBALL_SPORTS.includes(sport ?? '')

  const [s1, setS1] = useState(match.score1 !== null && !isVolleyball ? String(match.score1) : '')
  const [s2, setS2] = useState(match.score2 !== null && !isVolleyball ? String(match.score2) : '')

  const [sets, setSets] = useState<SetScore[]>(() => {
    if (isVolleyball && match.sets && match.sets.length > 0) {
      return match.sets.map((s) => ({ s1: String(s.s1), s2: String(s.s2) }))
    }
    return [{ s1: '', s2: '' }, { s1: '', s2: '' }]
  })

  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const firstInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => { firstInputRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function updateSet(idx: number, field: 's1' | 's2', val: string) {
    setSets((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s))
  }

  function submit() {
    setErr(null)

    if (isVolleyball) {
      const parsed = sets.map((s) => ({ s1: parseInt(s.s1), s2: parseInt(s.s2) }))
      if (parsed.some((s) => isNaN(s.s1) || isNaN(s.s2))) {
        setErr('Enter scores for all sets'); return
      }
      const wins1 = parsed.filter((s) => s.s1 > s.s2).length
      const wins2 = parsed.filter((s) => s.s2 > s.s1).length
      if (wins1 === wins2) { setErr('Match must have a winner — check set scores'); return }
      if (wins1 < 2 && wins2 < 2) { setErr('Neither team has won enough sets'); return }
      startTransition(async () => {
        const res = await recordBracketScore({
          matchId: match.id, bracketId, leagueId,
          score1: wins1, score2: wins2,
          sets: parsed,
        })
        if (res.error) { setErr(res.error) } else { router.refresh(); onClose() }
      })
      return
    }

    const n1 = parseInt(s1)
    const n2 = parseInt(s2)
    if (isNaN(n1) || isNaN(n2)) { setErr('Enter both scores'); return }
    if (n1 === n2) { setErr('No ties in playoffs'); return }
    startTransition(async () => {
      const res = await recordBracketScore({ matchId: match.id, bracketId, leagueId, score1: n1, score2: n2 })
      if (res.error) { setErr(res.error) } else { router.refresh(); onClose() }
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pt-3 pb-6 space-y-5">
          <div>
            <h3 className="font-semibold text-base text-gray-900">Enter score</h3>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{match.team1Name ?? match.team1Label ?? 'TBD'} vs {match.team2Name ?? match.team2Label ?? 'TBD'}</p>
          </div>

          {isVolleyball ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <span className="w-10 text-center">Set</span>
                <span className="flex-1 text-center truncate">{match.team1Name ?? match.team1Label ?? 'TBD'}</span>
                <span className="w-4" />
                <span className="flex-1 text-center truncate">{match.team2Name ?? match.team2Label ?? 'TBD'}</span>
              </div>
              {sets.map((set, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-10 text-center font-semibold">{i + 1}</span>
                  <div className="flex-1 flex justify-center">
                    <input
                      ref={i === 0 ? firstInputRef : undefined}
                      value={set.s1}
                      onChange={(e) => updateSet(i, 's1', e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                      type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                      className="w-16 h-12 border-2 rounded-xl text-2xl font-bold tabular-nums text-center focus:outline-none focus:border-blue-400"
                      placeholder="0"
                    />
                  </div>
                  <span className="text-gray-300 font-bold text-lg w-4 text-center">–</span>
                  <div className="flex-1 flex justify-center">
                    <input
                      value={set.s2}
                      onChange={(e) => updateSet(i, 's2', e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                      type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                      className="w-16 h-12 border-2 rounded-xl text-2xl font-bold tabular-nums text-center focus:outline-none focus:border-blue-400"
                      placeholder="0"
                    />
                  </div>
                  {sets.length > 1 && (
                    <button type="button" onClick={() => setSets((p) => p.filter((_, j) => j !== i))}
                      className="w-6 text-gray-300 hover:text-red-400 text-xl text-center">×</button>
                  )}
                </div>
              ))}
              {sets.length < 3 && (
                <button type="button"
                  onClick={() => setSets((prev) => [...prev, { s1: '', s2: '' }])}
                  className="text-sm text-blue-600 hover:underline pl-10">
                  + Add set 3
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-start justify-around gap-2 py-1">
              <div className="flex flex-col items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate max-w-[100px] text-center">{match.team1Name ?? match.team1Label ?? 'TBD'}</span>
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => setS1((v) => String(Math.max(0, parseInt(v || '0') - 1)))}
                    className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-transform flex items-center justify-center select-none">−</button>
                  <input
                    ref={firstInputRef}
                    value={s1} onChange={(e) => setS1(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                    type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                    className="w-14 text-4xl font-bold tabular-nums text-center border-0 outline-none bg-transparent"
                    placeholder="0"
                  />
                  <button type="button"
                    onClick={() => setS1((v) => String(parseInt(v || '0') + 1))}
                    className="w-10 h-10 rounded-full text-white text-xl font-bold active:scale-95 transition-transform flex items-center justify-center select-none"
                    style={{ backgroundColor: 'var(--brand-primary)' }}>+</button>
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-200 mt-8 shrink-0">–</div>
              <div className="flex flex-col items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate max-w-[100px] text-center">{match.team2Name ?? match.team2Label ?? 'TBD'}</span>
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => setS2((v) => String(Math.max(0, parseInt(v || '0') - 1)))}
                    className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-transform flex items-center justify-center select-none">−</button>
                  <input
                    value={s2} onChange={(e) => setS2(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                    type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                    className="w-14 text-4xl font-bold tabular-nums text-center border-0 outline-none bg-transparent"
                    placeholder="0"
                  />
                  <button type="button"
                    onClick={() => setS2((v) => String(parseInt(v || '0') + 1))}
                    className="w-10 h-10 rounded-full text-white text-xl font-bold active:scale-95 transition-transform flex items-center justify-center select-none"
                    style={{ backgroundColor: 'var(--brand-primary)' }}>+</button>
                </div>
              </div>
            </div>
          )}

          {err && <p className="text-sm text-red-500">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={submit} disabled={isPending}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isPending ? 'Saving…' : 'Save score'}
            </button>
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm border text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({
  match,
  bracketId,
  leagueId,
  isAdmin,
  sport,
}: {
  match: BracketMatchData
  bracketId: string
  leagueId: string
  isAdmin: boolean
  sport?: string
}) {
  const [modalOpen, setModalOpen] = useState(false)

  const isTbd = match.status === 'pending'
  const isCompleted = match.status === 'completed'
  const isBye = match.isBye
  const isReady = match.status === 'ready'

  return (
    <>
      {modalOpen && (
        <ScoreModal
          match={match} bracketId={bracketId} leagueId={leagueId} sport={sport}
          onClose={() => setModalOpen(false)}
        />
      )}
      <div className={`w-52 rounded-lg border bg-white text-sm shadow-sm ${
        isCompleted ? 'opacity-90' : isTbd ? 'opacity-50' : ''
      }`}>
        {(match.court || match.scheduledAt) && (
          <div className="px-3 pt-2 text-[10px] text-gray-400 flex items-center gap-1.5">
            {match.court && <span>Court {match.court}</span>}
            {match.court && match.scheduledAt && <span>·</span>}
            {match.scheduledAt && (
              <span>{new Date(match.scheduledAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            )}
          </div>
        )}

        <div className={`flex items-center justify-between px-3 py-2 border-b ${
          isCompleted && match.winnerTeamId === match.team1Id ? 'bg-green-50' : ''
        }`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {match.team1Seed && <span className="text-[10px] text-gray-400 w-4 shrink-0">{match.team1Seed}</span>}
            <span className={`truncate font-medium ${isCompleted && match.winnerTeamId === match.team1Id ? 'text-green-700' : isTbd ? 'text-gray-400' : ''}`}>
              {match.team1Name ?? match.team1Label ?? 'TBD'}
            </span>
          </div>
          <span className="font-bold tabular-nums text-sm ml-2">
            {isCompleted && match.score1 !== null ? match.score1 : ''}
          </span>
        </div>

        <div className={`flex items-center justify-between px-3 py-2 ${
          isCompleted && match.winnerTeamId === match.team2Id ? 'bg-green-50' : ''
        }`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {match.team2Seed && <span className="text-[10px] text-gray-400 w-4 shrink-0">{match.team2Seed}</span>}
            <span className={`truncate font-medium ${
              isBye ? 'text-gray-300 italic' :
              isCompleted && match.winnerTeamId === match.team2Id ? 'text-green-700' :
              isTbd ? 'text-gray-400' : ''
            }`}>
              {isBye ? 'Bye' : (match.team2Name ?? match.team2Label ?? 'TBD')}
            </span>
          </div>
          <span className="font-bold tabular-nums text-sm ml-2">
            {isCompleted && match.score2 !== null ? match.score2 : ''}
          </span>
        </div>

        {isCompleted && match.sets && match.sets.length > 0 && (
          <div className="px-3 py-1.5 border-t bg-gray-50 flex gap-2 flex-wrap">
            {match.sets.map((s, i) => (
              <span key={i} className="text-[11px] text-gray-500">
                <span className="font-medium text-gray-700">{s.s1}–{s.s2}</span>
              </span>
            ))}
          </div>
        )}

        {isAdmin && (isReady || isCompleted) && (
          <div className="border-t">
            <button
              onClick={() => setModalOpen(true)}
              className="w-full px-3 py-2 text-xs font-semibold text-center hover:bg-gray-50 active:bg-gray-100 transition-colors"
              style={{ color: 'var(--brand-primary)' }}
            >
              {isCompleted ? 'Edit score' : 'Enter score →'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Bracket diagram (reusable for both WB and LB sections) ───────────────────

const MATCH_HEIGHT = 116
const MATCH_GAP = 16
const ROUND_WIDTH = 224

function BracketDiagram({
  matches,
  bracketId,
  leagueId,
  isAdmin,
  sport,
  bracketSize,
  firstRoundMatchCount,
  roundSortAscending = false,
}: {
  matches: BracketMatchData[]
  bracketId: string
  leagueId: string
  isAdmin: boolean
  sport?: string
  bracketSize: number
  firstRoundMatchCount: number
  /** LB rounds use ascending order (LBR1 left → LBR4 right); WB uses descending */
  roundSortAscending?: boolean
}) {
  const roundNumbers = Array.from(new Set(matches.map((m) => m.roundNumber)))
    .sort((a, b) => roundSortAscending ? a - b : b - a)

  const totalHeight = firstRoundMatchCount * (MATCH_HEIGHT + MATCH_GAP) - MATCH_GAP

  function matchesForRound(rn: number) {
    return matches
      .filter((m) => m.roundNumber === rn)
      .sort((a, b) => a.matchNumber - b.matchNumber)
  }

  return (
    <div className="overflow-x-auto pb-4 -mx-4 px-4">
      <div style={{ minWidth: roundNumbers.length * ROUND_WIDTH + 32 }}>
        {/* Round labels */}
        <div className="flex mb-3">
          {roundNumbers.map((rn) => (
            <div key={rn} style={{ width: ROUND_WIDTH, flexShrink: 0 }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 px-2">
                {getRoundName(rn, bracketSize)}
              </p>
            </div>
          ))}
        </div>

        {/* Match columns */}
        <div className="flex items-start" style={{ height: totalHeight, gap: 0 }}>
          {roundNumbers.map((rn, colIdx) => {
            const roundMatches = matchesForRound(rn)
            const matchesInRound = roundMatches.length
            const slotHeight = totalHeight / matchesInRound

            return (
              <div key={rn} style={{ width: ROUND_WIDTH, flexShrink: 0, position: 'relative', height: totalHeight }}>
                {roundMatches.map((match, i) => {
                  const top = i * slotHeight + (slotHeight - MATCH_HEIGHT) / 2
                  const isLastCol = colIdx === roundNumbers.length - 1

                  return (
                    <div key={match.id} style={{ position: 'absolute', top, left: 8, right: 8 }}>
                      {/* Right horizontal connector */}
                      {!isLastCol && (
                        <div style={{
                          position: 'absolute', right: -8, top: MATCH_HEIGHT / 2,
                          width: 8, height: 1, backgroundColor: '#d1d5db',
                        }} />
                      )}
                      {/* Left vertical connector */}
                      {colIdx > 0 && (
                        <div style={{
                          position: 'absolute', left: -8,
                          top: MATCH_HEIGHT / 2 - slotHeight / 4,
                          width: 8, height: slotHeight / 2,
                          borderLeft: '1px solid #d1d5db',
                          borderTop: '1px solid #d1d5db',
                          borderBottom: '1px solid #d1d5db',
                        }} />
                      )}
                      <MatchCard
                        match={match} bracketId={bracketId} leagueId={leagueId}
                        isAdmin={isAdmin} sport={sport}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Score list view ───────────────────────────────────────────────────────────

function BracketScoreList({
  bracket,
  leagueId,
  sport,
}: {
  bracket: BracketData
  leagueId: string
  sport?: string
}) {
  const [activeMatch, setActiveMatch] = useState<BracketMatchData | null>(null)
  const bracketSize = bracket.bracketSize

  const isDE = bracket.bracketType === 'double_elimination'
  const roundNumbers = Array.from(new Set(bracket.matches.map((m) => m.roundNumber)))
    .sort((a, b) => {
      if (!isDE) return b - a // SE: descending (QF=4 first, Final=1 last)
      // DE: WB rounds first in play order, then LB rounds ascending, then GF
      const sideA = a < LB_ROUND_BASE ? 0 : a < GF_ROUND ? 1 : 2
      const sideB = b < LB_ROUND_BASE ? 0 : b < GF_ROUND ? 1 : 2
      if (sideA !== sideB) return sideA - sideB
      if (sideA === 0) return b - a // WB: descending
      return a - b // LB and GF: ascending
    })

  return (
    <div className="space-y-6">
      {activeMatch && (
        <ScoreModal
          match={activeMatch} bracketId={bracket.id} leagueId={leagueId} sport={sport}
          onClose={() => setActiveMatch(null)}
        />
      )}

      {roundNumbers.map((rn) => {
        const matches = bracket.matches
          .filter((m) => m.roundNumber === rn)
          .sort((a, b) => a.matchNumber - b.matchNumber)

        return (
          <div key={rn}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
              {getRoundName(rn, bracketSize)}
            </h3>
            <div className="space-y-2">
              {matches.map((match) => {
                const isPending = match.status === 'pending'
                const isReady = match.status === 'ready'
                const isCompleted = match.status === 'completed'
                const isBye = match.isBye

                return (
                  <div
                    key={match.id}
                    className={`bg-white rounded-lg border overflow-hidden ${
                      isReady ? 'border-orange-200' : ''
                    } ${isPending ? 'opacity-50' : ''}`}
                  >
                    <div className="px-4 py-3">
                      {(match.court || match.scheduledAt) && (
                        <p className="text-[11px] text-gray-400 mb-1">
                          {match.court && `Court ${match.court}`}
                          {match.court && match.scheduledAt && ' · '}
                          {match.scheduledAt && new Date(match.scheduledAt).toLocaleString('en-CA', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className={`flex items-center gap-1.5 ${isCompleted && match.winnerTeamId === match.team1Id ? 'text-green-700 font-semibold' : ''}`}>
                            {match.team1Seed && <span className="text-[10px] text-gray-400 w-4 shrink-0">{match.team1Seed}</span>}
                            <span className="text-sm truncate">{match.team1Name ?? match.team1Label ?? 'TBD'}</span>
                          </div>
                          <div className={`flex items-center gap-1.5 ${isCompleted && match.winnerTeamId === match.team2Id ? 'text-green-700 font-semibold' : isBye ? 'text-gray-300 italic' : ''}`}>
                            {match.team2Seed && <span className="text-[10px] text-gray-400 w-4 shrink-0">{match.team2Seed}</span>}
                            <span className="text-sm truncate">{isBye ? 'Bye' : (match.team2Name ?? match.team2Label ?? 'TBD')}</span>
                          </div>
                        </div>
                        {isCompleted && (
                          <div className="shrink-0 text-right">
                            <div className={`text-sm font-bold tabular-nums ${match.winnerTeamId === match.team1Id ? 'text-green-700' : 'text-gray-700'}`}>
                              {match.score1 ?? '–'}
                            </div>
                            <div className={`text-sm font-bold tabular-nums ${match.winnerTeamId === match.team2Id ? 'text-green-700' : 'text-gray-700'}`}>
                              {match.score2 ?? '–'}
                            </div>
                          </div>
                        )}
                        {isReady && (
                          <span className="shrink-0 text-[11px] font-medium text-orange-500">No score</span>
                        )}
                      </div>
                    </div>

                    {(isReady || isCompleted) && !isBye && (
                      <div className="border-t">
                        <button
                          onClick={() => setActiveMatch(match)}
                          className="w-full py-2.5 text-xs font-semibold text-center hover:bg-gray-50 active:bg-gray-100 transition-colors"
                          style={{ color: 'var(--brand-primary)' }}
                        >
                          {isCompleted ? 'Edit score' : 'Enter score →'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main BracketView ──────────────────────────────────────────────────────────

export function BracketView({ bracket, leagueId, isAdmin = false, sport }: Props) {
  const [view, setView] = useState<'bracket' | 'list'>('bracket')
  const bracketSize = bracket.bracketSize
  const isDE = bracket.bracketType === 'double_elimination'

  const pendingScoreCount = bracket.matches.filter((m) => m.status === 'ready').length

  // Split matches for DE
  const wbMatches = bracket.matches.filter((m) => m.roundNumber < LB_ROUND_BASE)
  const lbMatches = bracket.matches.filter((m) => m.roundNumber >= LB_ROUND_BASE && m.roundNumber < GF_ROUND)
  const gfMatch = bracket.matches.find((m) => m.roundNumber >= GF_ROUND)

  // For SE: separate 3rd place match
  const thirdPlaceMatch = !isDE && bracket.thirdPlaceGame
    ? bracket.matches.find((m) => m.roundNumber === 1 && m.matchNumber === 2)
    : null

  const seMatches = !isDE ? bracket.matches.filter((m) => !(thirdPlaceMatch && m.id === thirdPlaceMatch.id)) : []

  // First-round match counts for diagram height
  const seFirstRoundCount = (() => {
    const rounds = Array.from(new Set(seMatches.map((m) => m.roundNumber))).sort((a, b) => b - a)
    return rounds.length > 0 ? seMatches.filter((m) => m.roundNumber === rounds[0]).length : 1
  })()

  const wbFirstRoundCount = (() => {
    const rounds = Array.from(new Set(wbMatches.map((m) => m.roundNumber))).sort((a, b) => b - a)
    return rounds.length > 0 ? wbMatches.filter((m) => m.roundNumber === rounds[0]).length : 1
  })()

  const lbFirstRoundCount = (() => {
    const rounds = Array.from(new Set(lbMatches.map((m) => m.roundNumber))).sort((a, b) => a - b)
    return rounds.length > 0 ? lbMatches.filter((m) => m.roundNumber === rounds[0]).length : 1
  })()

  // Champion callout: different for SE vs DE
  const champion = (() => {
    if (isDE) {
      if (!gfMatch?.winnerTeamId) return null
      return gfMatch.winnerTeamId === gfMatch.team1Id ? gfMatch.team1Name : gfMatch.team2Name
    }
    const final = bracket.matches.find((m) => m.roundNumber === 1 && m.matchNumber === 1)
    if (!final?.winnerTeamId) return null
    return final.winnerTeamId === final.team1Id ? final.team1Name : final.team2Name
  })()

  return (
    <div>
      {/* View toggle */}
      {isAdmin && (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setView('bracket')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              view === 'bracket' ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={view === 'bracket' ? { backgroundColor: 'var(--brand-secondary)' } : {}}
          >
            Bracket
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
              view === 'list' ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={view === 'list' ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            Score list
            {pendingScoreCount > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                view === 'list' ? 'bg-white/30' : 'bg-orange-100 text-orange-700'
              }`}>
                {pendingScoreCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Score list */}
      {view === 'list' && isAdmin && (
        <BracketScoreList bracket={bracket} leagueId={leagueId} sport={sport} />
      )}

      {/* Bracket diagram */}
      {view === 'bracket' && (
        <>
          {isDE ? (
            /* ── Double elimination layout ─────────────────────────────── */
            <div className="space-y-8">
              {/* Winners Bracket */}
              {wbMatches.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">
                    Winners Bracket
                  </p>
                  <BracketDiagram
                    matches={wbMatches}
                    bracketId={bracket.id}
                    leagueId={leagueId}
                    isAdmin={isAdmin}
                    sport={sport}
                    bracketSize={bracketSize}
                    firstRoundMatchCount={wbFirstRoundCount}
                  />
                </div>
              )}

              {/* Losers Bracket */}
              {lbMatches.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-3 mt-4">
                    Losers Bracket
                  </p>
                  <BracketDiagram
                    matches={lbMatches}
                    bracketId={bracket.id}
                    leagueId={leagueId}
                    isAdmin={isAdmin}
                    sport={sport}
                    bracketSize={bracketSize}
                    firstRoundMatchCount={lbFirstRoundCount}
                    roundSortAscending
                  />
                </div>
              )}

              {/* Grand Final */}
              {gfMatch && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-bold uppercase tracking-widest text-purple-600 mb-3 mt-4">
                    Grand Final
                  </p>
                  <MatchCard
                    match={gfMatch}
                    bracketId={bracket.id}
                    leagueId={leagueId}
                    isAdmin={isAdmin}
                    sport={sport}
                  />
                </div>
              )}
            </div>
          ) : (
            /* ── Single elimination layout ─────────────────────────────── */
            <>
              <BracketDiagram
                matches={seMatches}
                bracketId={bracket.id}
                leagueId={leagueId}
                isAdmin={isAdmin}
                sport={sport}
                bracketSize={bracketSize}
                firstRoundMatchCount={seFirstRoundCount}
              />

              {/* 3rd place match */}
              {thirdPlaceMatch && (
                <div className="mt-8 pt-6 border-t">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Third Place</p>
                  <MatchCard
                    match={thirdPlaceMatch}
                    bracketId={bracket.id}
                    leagueId={leagueId}
                    isAdmin={isAdmin}
                    sport={sport}
                  />
                </div>
              )}
            </>
          )}

          {/* Champion callout */}
          {champion && (
            <div className="mt-6 text-center">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">Champion</p>
              <p className="text-2xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)', color: 'var(--brand-primary)' }}>
                🏆 {champion}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
