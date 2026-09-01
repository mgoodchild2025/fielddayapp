'use client'

import { useLiveScores } from '@/lib/use-live-scores'

// A tiny live-score chip for schedule/bracket rows: renders nothing unless a
// scoreboard is actively broadcasting for this game (or bracket match).
export function LiveScoreBadge({ leagueId, gameId }: { leagueId: string; gameId: string }) {
  const boards = useLiveScores(leagueId)
  const board = boards[gameId]
  if (!board) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
        board.final ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-600'
      }`}
    >
      {!board.final && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
      {board.final ? 'FINAL' : 'LIVE'} {board.a}–{board.b}
      {board.mode === 'sets' && !board.final && <span className="font-medium opacity-70">set {board.setNumber}</span>}
    </span>
  )
}
