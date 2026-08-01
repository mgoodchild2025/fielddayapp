'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Filter controls for the public event Schedule tab: Upcoming/Results sub-tabs
 * and a team picker. State lives in the URL (like the Standings sub-tabs), so
 * changing a control re-renders the server page with the new selection.
 */
export function ScheduleFilterBar({
  view,
  teamFilter,
  teams,
  myTeamIds = [],
}: {
  view: 'upcoming' | 'results'
  teamFilter: string
  teams: { id: string; name: string }[]
  /** Teams the signed-in player belongs to — surfaced as a "My team" shortcut. */
  myTeamIds?: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === 'all') params.delete(key)
    else params.set(key, value)
    router.push(`?${params.toString()}`, { scroll: false })
  }

  const myTeamId = myTeamIds.find((id) => teams.some((t) => t.id === id)) ?? null

  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      {/* Upcoming / Results sub-tabs */}
      <div className="flex gap-1 border-b border-gray-700">
        {(['upcoming', 'results'] as const).map((v) => {
          const active = view === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => setParam('scheduleView', v)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {v === 'upcoming' ? 'Upcoming' : 'Results'}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* "My team" shortcut for signed-in players */}
        {myTeamId && teamFilter !== myTeamId && (
          <button
            type="button"
            onClick={() => setParam('scheduleTeam', myTeamId)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors"
          >
            My team
          </button>
        )}

        {/* Team picker */}
        {teams.length > 1 && (
          <select
            value={teamFilter}
            onChange={(e) => setParam('scheduleTeam', e.target.value)}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-800 text-gray-200 focus:outline-none cursor-pointer"
            title="Filter by team"
          >
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
