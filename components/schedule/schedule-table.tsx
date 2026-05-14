'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AdminScoreEntry } from '@/components/scores/admin-score-entry'
import { EditGameModal } from '@/components/schedule/edit-game-modal'
import { venueLabel } from '@/lib/venue-label'
import { deleteGame, deleteGames, setSchedulePublished, clearAllGames } from '@/actions/schedule'

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
  status: string
  cancellationReason: string | null
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
  schedulePublished?: boolean
  isAdmin?: boolean
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

// Small trash SVG icon
function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
    </svg>
  )
}

// Small printer SVG icon
function PrintIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0118 8.653v4.097A2.25 2.25 0 0115.75 15h-.241l.305 1.984A1.75 1.75 0 0114.084 19H5.915a1.75 1.75 0 01-1.73-2.016L4.492 15H4.25A2.25 2.25 0 012 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.75-.107 1.126-.153V2.75zM6.5 4.25v2.09a41.38 41.38 0 017 0V4.25a.25.25 0 00-.25-.25h-6.5a.25.25 0 00-.25.25zM5.14 8.572a39.895 39.895 0 019.72 0l.328 2.132A39.903 39.903 0 0110 10.5a39.903 39.903 0 01-5.188-.796L5.14 8.572zm.912 8.678a.25.25 0 01-.247-.292L6.816 12.5h6.368l1.011 4.458a.25.25 0 01-.247.292H6.052z" clipRule="evenodd" />
    </svg>
  )
}

// Indeterminate checkbox (native DOM property can't be set via React attr)
function IndeterminateCheckbox({ checked, indeterminate, onChange, className }: {
  checked: boolean; indeterminate: boolean; onChange: () => void; className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange}
      className={`w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer ${className ?? ''}`} />
  )
}

export function ScheduleTable({ games, teams, leagueId, sport, timezone, schedulePublished = true, isAdmin = false }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'needs' | 'cancelled'>('all')
  // Track status overrides applied optimistically within this session
  const [statusOverrides, setStatusOverrides] = useState<Map<string, { status: string; reason: string | null }>>(new Map())

  function handleDeleteGame(gameId: string) {
    if (!confirm('Delete this game? This cannot be undone.')) return
    setDeletingId(gameId)
    startTransition(async () => {
      await deleteGame(gameId, leagueId)
      setDeletedIds((prev) => new Set([...prev, gameId]))
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(gameId); return s })
      setDeletingId(null)
    })
  }

  function handlePublishToggle() {
    startTransition(async () => {
      await setSchedulePublished(leagueId, !schedulePublished)
      router.refresh()
    })
  }

  function handleClearAll() {
    const count = games.filter(g => !deletedIds.has(g.id)).length
    if (!confirm(`Delete all ${count} game${count !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setIsClearing(true)
    startTransition(async () => {
      await clearAllGames(leagueId)
      setDeletedIds(new Set(games.map(g => g.id)))
      setSelectedIds(new Set())
      setIsClearing(false)
      router.refresh()
    })
  }

  function handleToggleSelect(gameId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(gameId) ? next.delete(gameId) : next.add(gameId)
      return next
    })
  }

  function handleSelectAll() {
    const visibleIds = visible.map(g => g.id)
    const allSelected = visibleIds.every(id => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds))
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    const count = ids.length
    if (!confirm(`Delete ${count} selected game${count !== 1 ? 's' : ''}? This cannot be undone.`)) return
    startTransition(async () => {
      await deleteGames(ids, leagueId)
      setDeletedIds((prev) => new Set([...prev, ...ids]))
      setSelectedIds(new Set())
    })
  }

  function handleStatusChanged(gameId: string, newStatus: string, reason: string | null) {
    setStatusOverrides((prev) => new Map(prev).set(gameId, { status: newStatus, reason }))
    if (editingGame?.id === gameId) {
      setEditingGame((prev) => prev ? { ...prev, status: newStatus, cancellationReason: reason } : null)
    }
  }

  // Merge status overrides into the game list
  const gamesWithOverrides = games.map((g) => {
    const override = statusOverrides.get(g.id)
    return override ? { ...g, status: override.status, cancellationReason: override.reason } : g
  })

  const allVisible = gamesWithOverrides.filter((g) => !deletedIds.has(g.id))
  const visible = allVisible.filter((g) => {
    if (filter === 'needs') return needsScore(g) && g.status === 'scheduled'
    if (filter === 'cancelled') return g.status === 'cancelled' || g.status === 'postponed'
    return true
  })
  const needsCount = allVisible.filter((g) => needsScore(g) && g.status === 'scheduled').length
  const cancelledCount = allVisible.filter((g) => g.status === 'cancelled' || g.status === 'postponed').length

  const groups = groupByDate(visible)

  // Selection state relative to currently visible games
  const visibleIds = visible.map(g => g.id)
  const selectedVisibleCount = visibleIds.filter(id => selectedIds.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  // Base URL for print pages (relative to current path hierarchy)
  const printBase = `/admin/events/${leagueId}/schedule/print`

  return (
    <>
      {/* Draft/Publish status banner — admin only */}
      {isAdmin && (
        <div className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 mb-4 text-sm ${
          schedulePublished
            ? 'bg-green-50 border border-green-200'
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${schedulePublished ? 'bg-green-500' : 'bg-amber-400'}`} />
            <span className={`font-medium ${schedulePublished ? 'text-green-800' : 'text-amber-800'}`}>
              {schedulePublished ? 'Published — players can view the schedule' : 'Draft — schedule is hidden from players'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {!schedulePublished && games.filter(g => !deletedIds.has(g.id)).length > 0 && (
              <button
                onClick={handleClearAll}
                disabled={isPending || isClearing}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {isClearing ? 'Clearing…' : `Clear all ${games.filter(g => !deletedIds.has(g.id)).length} games`}
              </button>
            )}
            <button
              onClick={handlePublishToggle}
              disabled={isPending}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 ${
                schedulePublished
                  ? 'text-gray-600 border border-gray-300 hover:bg-gray-100'
                  : 'text-white bg-green-600 hover:bg-green-700'
              }`}
            >
              {isPending ? '…' : schedulePublished ? 'Unpublish' : 'Publish Schedule →'}
            </button>
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
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
        {cancelledCount > 0 && (
          <button
            onClick={() => setFilter('cancelled')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
              filter === 'cancelled'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Cancelled/Postponed
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              filter === 'cancelled' ? 'bg-white/30' : 'bg-red-100 text-red-700'
            }`}>
              {cancelledCount}
            </span>
          </button>
        )}
      </div>

      {/* Bulk action bar — appears when any games are selected */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-3 text-sm">
          <span className="text-red-700 font-medium">
            {selectedIds.size} game{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isPending}
              className="px-3 py-1 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : `Delete ${selectedIds.size} game${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

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
                <div key={game.id} className={`bg-white rounded-lg border overflow-hidden ${
                  selectedIds.has(game.id) ? 'border-red-300 ring-1 ring-red-200' :
                  game.status === 'cancelled' ? 'border-red-200 opacity-75' :
                  game.status === 'postponed' ? 'border-amber-200 opacity-75' :
                  needsScore(game) ? 'border-orange-200' : ''
                }`}>
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      {isAdmin && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(game.id)}
                          onChange={() => handleToggleSelect(game.id)}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-400 mb-1">
                          {game.timeLabel}
                          {game.court ? ` · ${venueLabel(sport)} ${game.court}` : ''}
                          {game.weekNumber ? ` · Wk ${game.weekNumber}` : ''}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`font-semibold text-sm ${game.status === 'cancelled' || game.status === 'postponed' ? 'line-through text-gray-400' : ''}`}>
                            {game.homeTeamName} <span className="text-gray-400 font-normal">vs</span> {game.awayTeamName}
                          </p>
                          {game.status === 'cancelled' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>}
                          {game.status === 'postponed' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Postponed</span>}
                        </div>
                        {game.cancellationReason && (game.status === 'cancelled' || game.status === 'postponed') && (
                          <p className="text-[11px] text-gray-400 italic mt-0.5">{game.cancellationReason}</p>
                        )}
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
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteGame(game.id)}
                        disabled={deletingId === game.id}
                        className="px-3 py-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 disabled:opacity-40"
                        title="Delete game"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )) : (
          <div className="bg-white rounded-lg border px-4 py-12 text-center text-gray-400 text-sm">
            {filter === 'needs' ? 'All games have scores — nice work! 🎉' : filter === 'cancelled' ? 'No cancelled or postponed games.' : 'No games scheduled yet.'}
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
                  {isAdmin && (
                    <th className="pl-4 pr-2 py-3 w-8">
                      <IndeterminateCheckbox
                        checked={allVisibleSelected}
                        indeterminate={someVisibleSelected}
                        onChange={handleSelectAll}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium text-gray-500">Wk</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Time</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Matchup</th>
                  <th className="px-4 py-3 font-medium text-gray-500">{venueLabel(sport)}</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Score</th>
                  <th className="px-4 py-3 font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ dateKey, dateLabel, games: dayGames }) => (
                  <>
                    {/* Date group header */}
                    <tr key={`header-${dateKey}`} className="bg-gray-50 border-b border-t">
                      <td colSpan={isAdmin ? 7 : 6} className="px-4 py-2">
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
                      <tr key={game.id} className={`border-b last:border-0 hover:bg-gray-50 align-top ${selectedIds.has(game.id) ? 'bg-red-50' : ''} ${game.status === 'cancelled' || game.status === 'postponed' ? 'opacity-60' : ''}`}>
                        {isAdmin && (
                          <td className="pl-4 pr-2 py-3 w-8">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(game.id)}
                              onChange={() => handleToggleSelect(game.id)}
                              className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-gray-400 text-xs">{game.weekNumber ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-500">{game.timeLabel}</div>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={game.status === 'cancelled' || game.status === 'postponed' ? 'line-through text-gray-400' : ''}>
                              {game.homeTeamName}{' '}
                              <span className="text-gray-400 font-normal text-xs">vs</span>{' '}
                              {game.awayTeamName}
                            </span>
                            {game.status === 'cancelled' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>}
                            {game.status === 'postponed' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Postponed</span>}
                          </div>
                          {game.cancellationReason && (game.status === 'cancelled' || game.status === 'postponed') && (
                            <p className="text-[11px] text-gray-400 italic mt-0.5">{game.cancellationReason}</p>
                          )}
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
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteGame(game.id)}
                                disabled={deletingId === game.id}
                                className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                                title="Delete game"
                              >
                                {deletingId === game.id ? (
                                  <span className="text-xs">…</span>
                                ) : (
                                  <TrashIcon />
                                )}
                              </button>
                            )}
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
            {filter === 'needs' ? 'All games have scores — nice work! 🎉' : filter === 'cancelled' ? 'No cancelled or postponed games.' : 'No games scheduled yet. Add a game or import from CSV.'}
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
            status: editingGame.status,
            cancellationReason: editingGame.cancellationReason,
          }}
          teams={teams}
          sport={sport}
          onClose={() => setEditingGame(null)}
          onDeleted={() => {
            setDeletedIds((prev) => new Set([...prev, editingGame.id]))
            setEditingGame(null)
          }}
          onStatusChanged={handleStatusChanged}
        />
      )}
    </>
  )
}
