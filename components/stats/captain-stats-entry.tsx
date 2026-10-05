'use client'

import { useState, useTransition } from 'react'
import { getGameStatsForEntry } from '@/actions/stats'
import type { GameStatsEntryData } from '@/actions/stats'
import { GameStatsSheet } from './game-stats-sheet'
import { safeAction } from '@/lib/action-errors'

interface Props {
  gameId: string
  captainTeamId: string   // the team this captain belongs to
}

export function CaptainStatsEntry({ gameId, captainTeamId }: Props) {
  const [data, setData] = useState<GameStatsEntryData | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  function handleOpen() {
    if (data) {
      // Already loaded — just open
      setOpen(true)
      return
    }
    setError(null)
    startLoad(async () => {
      const res = await safeAction(getGameStatsForEntry(gameId))
      if (res.error || !res.data) {
        setError(res.error ?? 'Failed to load stats')
      } else {
        setData(res.data)
        setOpen(true)
      }
    })
  }

  return (
    <>
      <div className="mt-2 pt-2 border-t">
        <button
          onClick={handleOpen}
          disabled={loading}
          className="press inline-flex items-center min-h-10 text-sm font-semibold text-brand-ink disabled:opacity-50"
        >
          {loading ? 'Loading…' : '+ Enter stats'}
        </button>
        {error && <p role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
      </div>

      {data && (
        <GameStatsSheet
          open={open}
          gameId={gameId}
          leagueId={data.leagueId}
          homeTeam={data.homeTeam}
          awayTeam={data.awayTeam}
          statDefs={data.statDefs}
          existingStats={data.existingStats}
          restrictToTeamId={captainTeamId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
