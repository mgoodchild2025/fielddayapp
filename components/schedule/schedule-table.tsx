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
  /** YYYY-MM-DD in org timezone — used for Print Day URL */
  dateKey: string
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
  timezone: string
}

function needsScore(game: Game) {
  return !game.result || game.result.homeScore === null
}

/** Group an ordered array of games by dateKey, preserving order. */
function groupByDate(games: Game[]): { dateKey: string; dateLabel: string; games: Game[] }[] {
  const map = new Map<string, { dateLabel: string; games: Game[] }>()
  for (const g of games) {
    const key = g.dateKey || 'undated'
    if (!map.has(key)) map.set(key, { dateLabel: g.dateLabel, games: [] })
    map.get(key)!.games.push(g)
  }
  return Array.from(map.entries()).map(([dateKey, { dateLabel, games }]) => ({ dateKey, dateLabel, games }))
}

// Small printer SVG icon
function PrintIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0118 8.653v4.097A2.25 2.25 0 0115.75 15h-.241l.305 1.984A1.75 1.75 0 0114.084 19H5.915a1.75 1.75 0 01-1.73-2.016L4.492 15H4.25A2.25 2.25 0 012 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.75-.107 1.126-.153V2.75zM6.5 4.25v2.09a41.38 41.38 0 017 0V4.25a.25.25 0 00-.25-.25h-6.5a.25.25 0 00-.25.25zM5.14 8.572a39.895 39.895 0 019.72 0l.328 2.132A39.903 39.903 0 0110 10.5a39.903 39.903 0 01-5.188-.796L5.14 8.572zm.912 8.678a.25.25 0 01-.247-.292L6.816 12.5h6.368l1.011 4.458a.25.25 0 01-.247.292H6.052z" clipRule="evenodd" />
    </svg>
  )
}

export function ScheduleTable({ games, teams, leagueId, sport, timezone }: Props) {
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'needs'>('all')

  const allVisible = games.filter((g) => !deletedIds.has(g.id))
  const visible = allVisible.filter((g) => filter === 'needs' ? needsScore(g) : true)
  const needsCount = allVisible.filter(needsScore).length

  const groups = groupByDate(visible)

  // Base URL for print pages (relative to current path hierarchy)
  const printBase = `/admin/events/${leagueId}/schedule/print`

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
      <div className="md:hidden space-y-4">
        {groups.length > 0 ? groups.map(({ dateKey, dateLabel, games: dayGames }) => (
          <div key={dateKey}>
            {/* Mobile date header */}
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dateLabel}</span>
              {dateKey && dateKey !== 'undated' && (
                <a
                  href={`${printBase}?date=${dateKey}&type=schedule`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                >
                  <PrintIcon />
                  Print day
                </a>
              )}
            </div>
            <div className="space-y-2">
              {dayGames.map((game) => (
                <div key={game.id} className={`bg-white rounded-lg border overflow-hidden ${needsScore(game) ? 'border-orange-200' : ''}`}>
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 mb-1">
                          {game.timeLabel}
                          {game.court ? ` · Court ${game.court}` : ''}
                          {game.weekNumber ? ` · Wk ${game.weekNumber}` : ''}
                        </p>
                        <p className="font-semibold text-sm">
                          {game.homeTeamName} <span className="text-gray-400 font-normal">vs</span> {game.awayTeamName}
                        </p>
                      </div>
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
              ))}
            </div>
          </div>
        )) : (
          <div className="bg-white rounded-lg border px-4 py-12 text-center text-gray-400 text-sm">
            {filter === 'needs' ? 'All games have scores — nice work! 🎉' : 'No games scheduled yet.'}
          </div>
        )}
      </div>

      {/* ── Desktop: table grouped by date ── */}
      <div className="hidden md:block bg-white rounded-lg border overflow-hidden">
        {groups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Wk</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Time</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Matchup</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Court</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Score</th>
                  <th className="px-4 py-3 font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ dateKey, dateLabel, games: dayGames }) => (
                  <>
                    {/* Date group header */}
                    <tr key={`header-${dateKey}`} className="bg-gray-50 border-b border-t">
                      <td colSpan={6} className="px-4 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            {dateLabel}
                          </span>
                          {dateKey && dateKey !== 'undated' && (
                            <div className="flex items-center gap-3">
                              <a
                                href={`${printBase}?date=${dateKey}&type=schedule`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                                title="Print day schedule"
                              >
                                <PrintIcon />
                                Print day
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Game rows */}
                    {dayGames.map((game) => (
                      <tr key={game.id} className="border-b last:border-0 hover:bg-gray-50 align-top">
                        <td className="px-4 py-3 text-gray-400 text-xs">{game.weekNumber ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-500">{game.timeLabel}</div>
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
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingGame(game)}
                              className="text-xs text-gray-400 hover:text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                            {/* Print icons */}
                            <a
                              href={`${printBase}?gameId=${game.id}&type=scoresheet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Print score sheet"
                              className="text-gray-300 hover:text-gray-600 transition-colors"
                            >
                              <PrintIcon />
                            </a>
                            <a
                              href={`${printBase}?gameId=${game.id}&type=statsheet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Print stat sheet"
                              className="text-gray-300 hover:text-gray-600 transition-colors flex items-center gap-0.5 text-[10px]"
                            >
                              <PrintIcon />
                              <span>stats</span>
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-12 text-center text-gray-400">
            {filter === 'needs' ? 'All games have scores — nice work! 🎉' : 'No games scheduled yet. Add a game or import from CSV.'}
          </div>
        )}
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
