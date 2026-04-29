'use client'

import { getRoundName } from '@/lib/bracket'
import { recordBracketScore } from '@/actions/brackets'
import { useState, useTransition } from 'react'

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

interface Props {
  bracket: BracketData
  leagueId: string
  isAdmin?: boolean
}

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({
  match,
  bracketId,
  leagueId,
  isAdmin,
}: {
  match: BracketMatchData
  bracketId: string
  leagueId: string
  isAdmin: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isTbd = match.status === 'pending'
  const isCompleted = match.status === 'completed'
  const isBye = match.isBye
  const isReady = match.status === 'ready'

  function submitScore() {
    setErr(null)
    const n1 = parseInt(s1)
    const n2 = parseInt(s2)
    if (isNaN(n1) || isNaN(n2)) { setErr('Enter both scores'); return }
    if (n1 === n2) { setErr('No ties in playoffs'); return }
    startTransition(async () => {
      const res = await recordBracketScore({ matchId: match.id, bracketId, leagueId, score1: n1, score2: n2 })
      if (res.error) { setErr(res.error) } else { setEditing(false) }
    })
  }

  return (
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

      {/* Admin score entry */}
      {isAdmin && isReady && !isCompleted && !editing && (
        <div className="px-3 pb-2 pt-1">
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Enter score
          </button>
        </div>
      )}

      {isAdmin && editing && (
        <div className="px-3 pb-3 pt-2 space-y-1.5 border-t">
          <div className="flex items-center gap-1.5">
            <input
              value={s1}
              onChange={(e) => setS1(e.target.value)}
              type="number"
              min={0}
              className="w-14 border rounded px-2 py-1 text-xs text-center"
              placeholder="—"
            />
            <span className="text-gray-400 text-xs">vs</span>
            <input
              value={s2}
              onChange={(e) => setS2(e.target.value)}
              type="number"
              min={0}
              className="w-14 border rounded px-2 py-1 text-xs text-center"
              placeholder="—"
            />
          </div>
          {err && <p className="text-[10px] text-red-500">{err}</p>}
          <div className="flex gap-1.5">
            <button
              onClick={submitScore}
              disabled={isPending}
              className="flex-1 text-xs py-1 rounded text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isPending ? '…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setErr(null) }}
              className="flex-1 text-xs py-1 rounded border text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bracket view ──────────────────────────────────────────────────────────────

export function BracketView({ bracket, leagueId, isAdmin = false }: Props) {
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

  const MATCH_HEIGHT = 90 // px per match card
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
          />
        </div>
      )}
    </div>
  )
}
