'use client'

import { useState } from 'react'
import { AdminScoreEntry } from '@/components/scores/admin-score-entry'
import { EditGameModal } from '@/components/schedule/edit-game-modal'

interface SetScore { home: number; away: number }

interface Game {
  id: string
  scheduledAt: string
  court: string | null
  weekNumber: number | null
  homeTeamId: string | null
  awayTeamId: string | null
  homeTeamName: string
  awayTeamName: string
  dateLabel: string
  timeLabel: string
  result: {
    homeScore: number | null
    awayScore: number | null
    status: string
    sets: SetScore[] | null
  } | null
}

interface Team {
  id: string
  name: string
}

interface Props {
  games: Game[]
  teams: Team[]
  leagueId: string
  sport: string
}

export function ScheduleTable({ games, teams, leagueId, sport }: Props) {
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())

  const visible = games.filter(g => !deletedIds.has(g.id))

  return (
    <>
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Wk</th>
                <th className="px-4 py-3 font-medium text-gray-500">Date & Time</th>
                <th className="px-4 py-3 font-medium text-gray-500">Matchup</th>
                <th className="px-4 py-3 font-medium text-gray-500">Court</th>
                <th className="px-4 py-3 font-medium text-gray-500">Score</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {visible.length > 0 ? (
                visible.map((game) => (
                  <tr key={game.id} className="border-b last:border-0 hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 text-gray-400 text-xs">{game.weekNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-700">{game.dateLabel}</div>
                      <div className="text-xs text-gray-400">{game.timeLabel}</div>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {game.homeTeamName}{' '}
                      <span className="text-gray-400 font-normal text-xs">vs</span>{' '}
                      {game.awayTeamName}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{game.court ?? '—'}</td>
                    <td className="px-4 py-3">
                      <AdminScoreEntry
                        gameId={game.id}
                        leagueId={leagueId}
                        sport={sport}
                        homeTeamName={game.homeTeamName}
                        awayTeamName={game.awayTeamName}
                        existingResult={game.result}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingGame(game)}
                        className="text-xs text-gray-400 hover:text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    No games scheduled yet. Add a game or import from CSV.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingGame && (
        <EditGameModal
          game={{
            id: editingGame.id,
            leagueId,
            homeTeamId: editingGame.homeTeamId,
            awayTeamId: editingGame.awayTeamId,
            scheduledAt: editingGame.scheduledAt,
            court: editingGame.court,
            weekNumber: editingGame.weekNumber,
          }}
          teams={teams}
          onClose={() => setEditingGame(null)}
          onDeleted={() => {
            setDeletedIds(prev => new Set([...prev, editingGame.id]))
            setEditingGame(null)
          }}
        />
      )}
    </>
  )
}
