'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLiveScore } from '@/lib/use-live-scores'
import { ScoreTick } from '@/components/scoreboard/score-tick'

// A tiny live-score chip for schedule/bracket rows: renders nothing unless a
// scoreboard is actively broadcasting for this game (or bracket match).
//
// Uses the single-game hook deliberately. A schedule page mounts one badge per
// row, and the whole-map hook re-rendered all of them on every broadcast from
// any court in the event.
export function LiveScoreBadge({ leagueId, gameId }: { leagueId: string; gameId: string }) {
  const board = useLiveScore(leagueId, gameId)
  const router = useRouter()
  const refreshed = useRef(false)

  // The scorer ended the match: the saved result exists now (or will in a
  // moment), but this page was rendered without it — once the live board is
  // pruned the row went back to blank until a reload. Pull the saved score.
  const isFinal = !!board?.final
  useEffect(() => {
    if (!isFinal || refreshed.current) return
    refreshed.current = true
    const t = setTimeout(() => router.refresh(), 4000)
    return () => clearTimeout(t)
  }, [isFinal, router])

  if (!board) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
        board.final ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-600'
      }`}
    >
      {!board.final && <span className="w-1.5 h-1.5 rounded-full bg-red-500 motion-safe:animate-pulse shrink-0" />}
      {board.final ? 'FINAL' : 'LIVE'} <ScoreTick value={board.a} />–<ScoreTick value={board.b} />
      {board.mode === 'sets' && !board.final && <span className="font-medium opacity-70">set {board.setNumber}</span>}
    </span>
  )
}
