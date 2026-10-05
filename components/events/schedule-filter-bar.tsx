'use client'

import { useState, useTransition } from 'react'
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

  // The tapped tab / team lights at once (the server render can take a
  // moment on game-day wifi, and taps looked ignored); the list dims while
  // the new one loads.
  const [isPending, startTransition] = useTransition()
  const [pendingView, setPendingView] = useState<'upcoming' | 'results' | null>(null)
  const [pendingTeam, setPendingTeam] = useState<string | null>(null)
  const shownView = isPending && pendingView ? pendingView : view
  const shownTeam = isPending && pendingTeam ? pendingTeam : teamFilter

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === 'all') params.delete(key)
    else params.set(key, value)
    if (key === 'scheduleView') setPendingView(value as 'upcoming' | 'results')
    if (key === 'scheduleTeam') setPendingTeam(value ?? 'all')
    startTransition(() => { router.push(`?${params.toString()}`, { scroll: false }) })
  }

  const myTeamId = myTeamIds.find((id) => teams.some((t) => t.id === id)) ?? null

  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap" aria-busy={isPending || undefined} data-schedule-pending={isPending || undefined}>
      {/* Upcoming / Results sub-tabs */}
      <div role="tablist" aria-label="Schedule" className="flex gap-1 border-b border-gray-700">
        {(['upcoming', 'results'] as const).map((v) => {
          const active = shownView === v
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setParam('scheduleView', v)}
              // Inactive was gray-500 on the dark frame (~3.6:1).
              className={`min-h-10 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                  : 'border-transparent text-gray-300 hover:text-white'
              }`}
            >
              {v === 'upcoming' ? 'Upcoming' : 'Results'}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* "My team" shortcut for signed-in players */}
        {myTeamId && shownTeam !== myTeamId && (
          <button
            type="button"
            onClick={() => setParam('scheduleTeam', myTeamId)}
            className="press min-h-10 px-3.5 rounded-full text-sm font-semibold bg-gray-800 text-gray-100 hover:bg-gray-700"
          >
            My team
          </button>
        )}

        {/* Team picker */}
        {teams.length > 1 && (
          <select
            value={shownTeam}
            onChange={(e) => setParam('scheduleTeam', e.target.value)}
            aria-label="Filter by team"
            className="min-h-10 px-3 rounded-full text-sm font-medium bg-gray-800 text-gray-100 cursor-pointer focus-visible:ring-2 focus-visible:ring-white/60"
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
