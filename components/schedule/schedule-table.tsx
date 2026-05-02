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
  /** Placeholder label shown when homeTeamId is null (template/pre-scheduled) */
  homeTeamLabel: string | null
  /** Placeholder label shown when awayTeamId is null (template/pre-scheduled) */
  awayTeamLabel: string | null
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

function needsScore(game: Game) {
  return !game.result || game.result.homeScore === null
}

export function ScheduleTable({ games, teams, leagueId, sport }: Props) {
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'needs'>('all')

  const visible = games
    .filter((g) => !deletedIds.has(g.id))
    .filter((g) => filter === 'needs' ? needsScore(g) : true)

  const needsCount = games.filter((g) => !deletedIds.has(g.id) && needsScore(g)).length

  return (
    <>
      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          style={filter === 'all' ? { backgroundColor: 'var(--brand-secondary)' } : {}}
        >
          All games
        </button>
        <button
          onClick={() => setFilter('needs')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filter === 'needs'
              ? 'text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          style={filter === 'needs' ? { backgroundColor: 'var(--brand-primary)' } : {}}
        >
          Needs scores
          {needsCount > 0 && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              filter === 'needs' ? 'bg-white/30' : 'bg-orange-100 text-orange-700'
            }`}>
              {needsCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Mobile: card list ── */}
      <div className="md:hidden space-y-2">
        {visible.length > 0 ? visible.map((game) => (
          <div key={game.id} className={`bg-white rounded-lg border overflow-hidden ${needsScore(game) ? 'border-orange-200' : ''}`}>
            {/* Tap zone opens score entry */}
            <div className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 mb-1">
                    {game.dateLabel} · {game.timeLabel}
                    {game.court ? ` · Court ${game.court}` : ''}
                    {game.weekNumber ? ` · Wk ${game.weekNumber}` : ''}
                  </p>
                  <p className="font-semibold text-sm">
                    {game.homeTeamName} <span className="text-gray-400 font-normal">vs</span> {game.awayTeamName}
                  </p>
                </div>
                {/* Score / status */}
                <div className="shrink-0 text-right">
                  {game.result?.homeScore !== null && game.result?.homeScore !== undefined ? (
                    <div>
                      <span className="font-bold tabular-nums text-sm">
                        {game.result.homeScore} – {game.result.awayScore}
                      </span>
                      {game.result.sets && game.result.sets.length > 0 && (
                        <span className="block text-[10px] text-gray-400 tabular-nums">
                          {game.result.sets.map((s) => `${s.home}–${s.away}`).join(', ')}
                        </span>
                      )}
                      {game.result.status === 'confirmed' ? (
                        <span className="block text-[10px] font-medium text-green-600">✓ confirmed</span>
                      ) : (
                        <span className="block text-[10px] font-medium text-amber-600">pending</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] font-medium text-orange-500">No score</span>
                  )}
                </div>
              </div>
            </div>
            {/* Action row */}
            <div className="border-t flex">
              <div className="flex-1 border-r">
                <AdminScoreEntry
                  gameId={game.id}
                  leagueId={leagueId}
                  sport={sport}
                  homeTeamName={game.homeTeamName}
                  awayTeamName={game.awayTeamName}
                  existingResult={game.result}
                  compact
                />
              </div>
              <button
                onClick={() => setEditingGame(game)}
                className="px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 active:bg-gray-100"
              >
                Edit
              </button>
            </div>
          </div>
        )) : (
          <div className="bg-white rounded-lg border px-4 py-12 text-center text-gray-400 text-sm">
            {filter === 'needs' ? 'All games have scores — nice work! 🎉' : 'No games scheduled yet.'}
          </div>
        )}
      </div>

      {/* ── Desktop: table ── */}
      <div className="hidden md:block bg-white rounded-lg border overflow-hidden">
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
                    {filter === 'needs' ? 'All games have scores — nice work! 🎉' : 'No games scheduled yet. Add a game or import from CSV.'}
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
            homeTeamLabel: editingGame.homeTeamLabel,
            awayTeamLabel: editingGame.awayTeamLabel,
            scheduledAt: editingGame.scheduledAt,
            court: editingGame.court,
            weekNumber: editingGame.weekNumber,
          }}
          teams={teams}
          onClose={() => setEditingGame(null)}
          onDeleted={() => {
            setDeletedIds((prev) => new Set([...prev, editingGame.id]))
            setEditingGame(null)
          }}
        />
      )}
    </>
  )
}
