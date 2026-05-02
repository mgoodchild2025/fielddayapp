'use client'

import { useState } from 'react'
import { GameStatsSheet } from './game-stats-sheet'
import type { RosterMember } from './game-stats-sheet'
import type { StatDef, GameStats } from '@/actions/stats'

export interface GameForStats {
  id: string
  label: string        // e.g. "Week 3 · Tue Jan 14 · 7:00 PM"
  homeTeamId: string
  homeTeamName: string
  awayTeamId: string
  awayTeamName: string
  hasStats: boolean    // true if any stats already saved for this game
}

interface Props {
  leagueId: string
  games: GameForStats[]
  teams: Record<string, { id: string; name: string; members: RosterMember[] }>
  statDefs: StatDef[]
  allGameStats: Record<string, GameStats>   // gameId → GameStats
}

export function StatsEntryTable({ leagueId, games, teams, statDefs, allGameStats }: Props) {
  const [activeGameId, setActiveGameId] = useState<string | null>(null)

  const activeGame = games.find(g => g.id === activeGameId)
  const homeTeam = activeGame ? teams[activeGame.homeTeamId] : null
  const awayTeam = activeGame ? teams[activeGame.awayTeamId] : null

  if (games.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        No completed games yet. Stats can be entered once games have been played.
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {games.map(game => (
          <div
            key={game.id}
            className="bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            {/* Game info */}
            <div className="min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">{game.label}</p>
              <p className="text-sm font-semibold">
                {game.homeTeamName}
                <span className="text-gray-400 font-normal mx-1.5">vs</span>
                {game.awayTeamName}
              </p>
            </div>

            {/* Action */}
            <button
              onClick={() => setActiveGameId(game.id)}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                game.hasStats
                  ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  : 'text-white border-transparent'
              }`}
              style={!game.hasStats ? { backgroundColor: 'var(--brand-primary)' } : {}}
            >
              {game.hasStats ? 'Edit Stats' : 'Enter Stats'}
            </button>
          </div>
        ))}
      </div>

      {/* Stats sheet portal */}
      {activeGame && homeTeam && awayTeam && (
        <GameStatsSheet
          gameId={activeGame.id}
          leagueId={leagueId}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          statDefs={statDefs}
          existingStats={allGameStats[activeGame.id] ?? {}}
          onClose={() => setActiveGameId(null)}
        />
      )}
    </>
  )
}
