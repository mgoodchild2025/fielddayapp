'use client'

import { getRoundName } from '@/lib/bracket'
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

  // Simple (non-volleyball) state — pre-fill if editing
  const [s1, setS1] = useState(match.score1 !== null && !isVolleyball ? String(match.score1) : '')
  const [s2, setS2] = useState(match.score2 !== null && !isVolleyball ? String(match.score2) : '')

  // Volleyball set state — pre-fill from existing sets, or start with 2 blank sets
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
      // Validate and parse set scores
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-96 p-5 space-y-4">
        <h3 className="font-semibold text-base">Enter score</h3>

        {isVolleyball ? (
          <div className="space-y-3">
            {/* Column headers */}
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Team</span>
              {sets.map((_, i) => (
                <span key={i} className="w-14 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Set {i + 1}
                </span>
              ))}
            </div>

            {/* Team 1 row */}
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm font-medium truncate">{match.team1Name ?? 'TBD'}</span>
              {sets.map((set, i) => (
                <input
                  key={i}
                  ref={i === 0 ? firstInputRef : undefined}
                  value={set.s1}
                  onChange={(e) => updateSet(i, 's1', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                  type="number"
                  min={0}
                  className="w-14 border rounded-md px-2 py-1.5 text-sm text-center"
                  placeholder="0"
                />
              ))}
            </div>

            {/* Team 2 row */}
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm font-medium truncate">{match.team2Name ?? 'TBD'}</span>
              {sets.map((set, i) => (
                <input
                  key={i}
                  value={set.s2}
                  onChange={(e) => updateSet(i, 's2', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                  type="number"
                  min={0}
                  className="w-14 border rounded-md px-2 py-1.5 text-sm text-center"
                  placeholder="0"
                />
              ))}
            </div>

            {sets.length < 3 && (
              <button
                type="button"
                onClick={() => setSets((prev) => [...prev, { s1: '', s2: '' }])}
                className="text-xs text-blue-600 hover:underline"
              >
                + Add set 3
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium truncate flex-1">{match.team1Name ?? 'TBD'}</span>
              <input
                ref={firstInputRef}
                value={s1}
                onChange={(e) => setS1(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                type="number"
                min={0}
                className="w-16 border rounded-md px-2 py-1.5 text-sm text-center"
                placeholder="0"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium truncate flex-1">{match.team2Name ?? 'TBD'}</span>
              <input
                value={s2}
                onChange={(e) => setS2(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                type="number"
                min={0}
                className="w-16 border rounded-md px-2 py-1.5 text-sm text-center"
                placeholder="0"
              />
            </div>
          </div>
        )}

        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={isPending}
            className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isPending ? 'Saving…' : 'Save score'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-md text-sm border text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
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
          match={match}
          bracketId={bracketId}
          leagueId={leagueId}
          sport={sport}
          onClose={() => setModalOpen(false)}
        />
      )}
      <div className={`w-52 rounded-lg border bg-white text-sm shadow-sm ${
        isCompleted ? 'opacity-90' : isTbd ? 'opacity-50' : ''
      }`}>
        {/* Match header */}
        {(match.court || match.scheduledAt) && (
          <div className="px-3 pt-2 text-[10px] text-gray-400 flex items-center gap-1.5">
            {match.court && <span>Court {match.court}</span>}
            {match.court && match.scheduledAt && <span>·</span>}
            {match.scheduledAt && (
              <span>{new Date(match.scheduledAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            )}
          </div>
        )}

        {/* Team 1 */}
        <div className={`flex items-center justify-between px-3 py-2 border-b ${
          isCompleted && match.winnerTeamId === match.team1Id ? 'bg-green-50' : ''
        }`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {match.team1Seed && <span className="text-[10px] text-gray-400 w-4 shrink-0">{match.team1Seed}</span>}
            <span className={`truncate font-medium ${isCompleted && match.winnerTeamId === match.team1Id ? 'text-green-700' : isTbd ? 'text-gray-400' : ''}`}>
              {match.team1Name ?? 'TBD'}
            </span>
          </div>
          <span className="font-bold tabular-nums text-sm ml-2">
            {isCompleted && match.score1 !== null ? match.score1 : ''}
          </span>
        </div>

        {/* Team 2 */}
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
              {isBye ? 'Bye' : (match.team2Name ?? 'TBD')}
            </span>
          </div>
          <span className="font-bold tabular-nums text-sm ml-2">
            {isCompleted && match.score2 !== null ? match.score2 : ''}
          </span>
        </div>

        {/* Set scores */}
        {isCompleted && match.sets && match.sets.length > 0 && (
          <div className="px-3 py-1.5 border-t bg-gray-50 flex gap-2 flex-wrap">
            {match.sets.map((s, i) => (
              <span key={i} className="text-[11px] text-gray-500">
                <span className="font-medium text-gray-700">{s.s1}–{s.s2}</span>
              </span>
            ))}
          </div>
        )}

        {/* Admin score entry / edit trigger */}
        {isAdmin && (isReady || isCompleted) && (
          <div className="px-3 pb-2 pt-1 border-t">
            <button
              onClick={() => setModalOpen(true)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              {isCompleted ? 'Edit score' : 'Enter score'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Bracket view ──────────────────────────────────────────────────────────────

export function BracketView({ bracket, leagueId, isAdmin = false, sport }: Props) {
  const bracketSize = bracket.bracketSize

  // Collect rounds in display order (left = earliest, right = final)
  const allRoundNumbers = Array.from(new Set(bracket.matches.map((m) => m.roundNumber)))
    .sort((a, b) => b - a) // descending: quarters → semis → final
  const [finalRound, ...prevRounds] = [...allRoundNumbers].reverse() // ascending for display

  // Separate 3rd place match
  const thirdPlaceMatch = bracket.thirdPlaceGame
    ? bracket.matches.find((m) => m.roundNumber === 1 && m.matchNumber === 2)
    : null

  // Build round columns (exclude 3rd place from main flow)
  const displayRounds = [...prevRounds].reverse()
  displayRounds.push(finalRound)

  const MATCH_HEIGHT = 116 // px per match card (accounts for set scores row + admin button)
  const MATCH_GAP = 16   // px between match cards in a column
  const ROUND_WIDTH = 224 // px per round column (w-52 = 208 + 16 padding)

  function matchesForRound(rn: number) {
    return bracket.matches
      .filter((m) => m.roundNumber === rn && !(thirdPlaceMatch && m.id === thirdPlaceMatch.id))
      .sort((a, b) => a.matchNumber - b.matchNumber)
  }

  // Total height = number of first-round matches × (match height + gap) - gap
  // allRoundNumbers is sorted descending, so [0] is the highest round number (most matches = first round)
  const firstRound = allRoundNumbers[0]
  const firstRoundMatchCount = matchesForRound(firstRound).length
  const totalHeight = firstRoundMatchCount * (MATCH_HEIGHT + MATCH_GAP) - MATCH_GAP

  return (
    <div>
      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        <div style={{ minWidth: displayRounds.length * ROUND_WIDTH + 32 }}>
          {/* Round labels */}
          <div className="flex mb-3" style={{ gap: 0 }}>
            {displayRounds.map((rn) => (
              <div key={rn} style={{ width: ROUND_WIDTH, flexShrink: 0 }}>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 px-2">
                  {getRoundName(rn, bracketSize)}
                </p>
              </div>
            ))}
          </div>

          {/* Match columns */}
          <div className="flex items-start" style={{ height: totalHeight, gap: 0 }}>
            {displayRounds.map((rn, colIdx) => {
              const roundMatches = matchesForRound(rn)
              const matchesInRound = roundMatches.length
              const slotHeight = totalHeight / matchesInRound

              return (
                <div key={rn} style={{ width: ROUND_WIDTH, flexShrink: 0, position: 'relative', height: totalHeight }}>
                  {roundMatches.map((match, i) => {
                    const top = i * slotHeight + (slotHeight - MATCH_HEIGHT) / 2
                    const isLastCol = colIdx === displayRounds.length - 1

                    return (
                      <div key={match.id} style={{ position: 'absolute', top, left: 8, right: 8 }}>
                        {/* Connector lines */}
                        {!isLastCol && (
                          <>
                            {/* Right horizontal line out */}
                            <div style={{
                              position: 'absolute',
                              right: -8,
                              top: MATCH_HEIGHT / 2,
                              width: 8,
                              height: 1,
                              backgroundColor: '#d1d5db',
                            }} />
                          </>
                        )}
                        {/* Vertical connector from previous round.
                            Spans between the two prev-round match centers:
                            top = card_top + (MATCH_HEIGHT/2 - slotHeight/4)
                            height = slotHeight/2  */}
                        {colIdx > 0 && (
                          <div style={{
                            position: 'absolute',
                            left: -8,
                            top: MATCH_HEIGHT / 2 - slotHeight / 4,
                            width: 8,
                            height: slotHeight / 2,
                            borderLeft: '1px solid #d1d5db',
                            borderTop: '1px solid #d1d5db',
                            borderBottom: '1px solid #d1d5db',
                          }} />
                        )}

                        <MatchCard
                          match={match}
                          bracketId={bracket.id}
                          leagueId={leagueId}
                          isAdmin={isAdmin}
                          sport={sport}
                        />
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Champion callout */}
          {bracket.matches.find((m) => m.roundNumber === 1 && m.matchNumber === 1 && m.winnerTeamId) && (() => {
            const final = bracket.matches.find((m) => m.roundNumber === 1 && m.matchNumber === 1)!
            const champName = final.winnerTeamId === final.team1Id ? final.team1Name : final.team2Name
            return (
              <div className="mt-6 text-center">
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">Champion</p>
                <p className="text-2xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)', color: 'var(--brand-primary)' }}>
                  🏆 {champName}
                </p>
              </div>
            )
          })()}
        </div>
      </div>

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
    </div>
  )
}
