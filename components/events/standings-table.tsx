import type { ReactNode } from 'react'
import Link from 'next/link'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { computePts, sortStandings, VOLLEYBALL_SPORTS, type PtsMethod, type VolleyballMode, type TeamStat } from '@/lib/standings'

/**
 * Public event standings table (sets table for set-based volleyball, match
 * table otherwise). Every column at every width, one line per team: on a
 * phone the table scrolls sideways inside its card. Nothing is pinned — the
 * whole row moves together.
 */

function Legend({ items }: { items: { abbr: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
      {items.map(({ abbr, label }) => (
        <span key={abbr} className="text-xs text-gray-500">
          <span className="font-semibold text-gray-500">{abbr}</span> = {label}
        </span>
      ))}
    </div>
  )
}

function StreakBadge({ streak }: { streak: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${streak.startsWith('W') ? 'bg-green-50 text-green-700' : streak.startsWith('L') ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}
      title={streak.startsWith('W') ? `${streak.slice(1)}-game win streak` : streak.startsWith('L') ? `${streak.slice(1)}-game losing streak` : `${streak.slice(1)} straight ties`}
    >
      {streak}
    </span>
  )
}

function RankCell({ rank }: { rank: number }) {
  return (
    <td className={`pl-3 pr-1 sm:px-4 py-3 text-xs tabular-nums ${rank <= 3 ? 'font-bold text-gray-700' : 'text-gray-500'}`}>{rank}</td>
  )
}

function TeamCell({ team, streak }: { team: { id: string; name: string; logoUrl?: string | null; color?: string | null }; streak?: string | null }) {
  return (
    // The one cell allowed to wrap: a long name takes a second line (capped
    // on phones) instead of pushing every stat off-screen.
    <td className="px-2 sm:px-4 py-3 font-medium whitespace-normal min-w-[10.5rem] max-sm:max-w-[11.5rem]">
      <div className="flex items-center gap-2">
        <Link href={`/teams/${team.id}/stats`} prefetch={false} className="flex items-center gap-2 min-w-0 hover:underline">
          <TeamAvatar logoUrl={team.logoUrl ?? null} color={team.color ?? null} name={team.name} size="sm" className="shrink-0 max-sm:w-6 max-sm:h-6 max-sm:text-xs" />
          <span className="leading-snug">{team.name}</span>
        </Link>
        {streak && <span className="shrink-0"><StreakBadge streak={streak} /></span>}
      </div>
    </td>
  )
}

const TH = 'px-2.5 sm:px-3 py-3 font-medium text-gray-500 text-center'
const TD = 'px-2.5 sm:px-3 py-3 text-center tabular-nums'

function rowClass(i: number) {
  // Striped by index, like the rest of the app's tables.
  return `border-b last:border-0 ${i % 2 === 1 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100 transition-colors`
}

/** The card + sideways scroller both tables share. `whitespace-nowrap` keeps each team on one line. */
function TableFrame({ children, legend }: { children: ReactNode; legend: { abbr: string; label: string }[] }) {
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="text-sm w-full whitespace-nowrap">{children}</table>
        </div>
      </div>
      <Legend items={legend} />
    </div>
  )
}

export function StandingsTable({
  teams,
  sport,
  ptsMethod,
  volleyballMode,
}: {
  teams: TeamStat[]
  sport?: string | null
  ptsMethod?: PtsMethod
  volleyballMode?: VolleyballMode
}) {
  const isVolleyball = VOLLEYBALL_SPORTS.has(sport ?? '')
  const mode: VolleyballMode = volleyballMode ?? 'match_based'
  const method: PtsMethod = ptsMethod ?? 'wins'

  const sorted = sortStandings(teams, sport, mode, method)

  if (sorted.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-8">No results yet — standings appear after the first scores are in.</p>
  }

  // ── Set-based table ────────────────────────────────────────────────────────
  if (isVolleyball && mode === 'set_based') {
    const legend = [
      { abbr: 'MP', label: 'Matches Played' },
      { abbr: 'SW', label: 'Sets Won' },
      { abbr: 'SL', label: 'Sets Lost' },
      { abbr: 'SPF', label: 'Set Points For (total points scored)' },
      { abbr: 'SPA', label: 'Set Points Against (total points allowed)' },
      { abbr: 'PD', label: 'Point Differential (SPF − SPA)' },
    ]
    return (
      <TableFrame legend={legend}>
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="pl-3 pr-1 sm:px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
              <span className="sm:hidden" aria-hidden="true">#</span>
              <span className="max-sm:sr-only">Rank</span>
            </th>
            <th className="px-2 sm:px-4 py-3 font-medium text-gray-500">Team</th>
            <th className={TH}>MP</th>
            <th className={TH}>SW</th>
            <th className={TH}>SL</th>
            <th className={TH}>SPF</th>
            <th className={TH}>SPA</th>
            <th className={TH}>PD</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, i) => {
            const pd = team.pointsFor - team.pointsAgainst
            return (
              <tr key={team.id} className={rowClass(i)}>
                <RankCell rank={i + 1} />
                <TeamCell team={team} />
                <td className={`${TD} text-gray-500`}>{team.matchesPlayed}</td>
                <td className={`${TD} font-semibold text-brand-ink`}>{team.setWins}</td>
                <td className={`${TD} text-gray-500`}>{team.setLosses}</td>
                <td className={`${TD} text-gray-500`}>{team.pointsFor}</td>
                <td className={`${TD} text-gray-500`}>{team.pointsAgainst}</td>
                <td className={`${TD} text-gray-500`}>{pd > 0 ? '+' : ''}{pd}</td>
              </tr>
            )
          })}
        </tbody>
      </TableFrame>
    )
  }

  // ── Match-based table (default, also used for non-volleyball sports) ────────
  const ptsLabel = {
    wins: 'Match Wins',
    set_wins: 'Set Wins (SW)',
    set_differential: 'Set Differential (SW − SL)',
    points_for: 'Points For (PF)',
  }[method]

  const legend = [
    { abbr: 'MP', label: 'Matches Played' },
    { abbr: 'W', label: 'Match Wins' },
    { abbr: 'L', label: 'Match Losses' },
    ...(isVolleyball ? [
      { abbr: 'SW', label: 'Sets Won' },
      { abbr: 'SL', label: 'Sets Lost' },
    ] : []),
    { abbr: 'PF', label: isVolleyball ? 'Points For (set-level)' : 'Points For' },
    { abbr: 'PA', label: isVolleyball ? 'Points Against (set-level)' : 'Points Against' },
    { abbr: 'PD', label: 'Point Differential (PF − PA)' },
    ...(isVolleyball ? [{ abbr: 'PTS', label: `Standings Points — ${ptsLabel}` }] : []),
  ]

  return (
    <TableFrame legend={legend}>
      <thead>
        <tr className="border-b bg-gray-50 text-left">
          <th className="pl-3 pr-1 sm:px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
            <span className="sm:hidden" aria-hidden="true">#</span>
            <span className="max-sm:sr-only">Rank</span>
          </th>
          <th className="px-2 sm:px-4 py-3 font-medium text-gray-500">Team</th>
          <th className={TH}>MP</th>
          <th className={TH}>W</th>
          <th className={TH}>L</th>
          {isVolleyball && <>
            <th className={TH}>SW</th>
            <th className={TH}>SL</th>
          </>}
          <th className={TH}>PF</th>
          <th className={TH}>PA</th>
          <th className={TH}>PD</th>
          {isVolleyball && <th className={TH}>PTS</th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map((team, i) => {
          const pd = team.pointsFor - team.pointsAgainst
          return (
            <tr key={team.id} className={rowClass(i)}>
              <RankCell rank={i + 1} />
              <TeamCell team={team} streak={team.streak} />
              <td className={`${TD} text-gray-500`}>{team.matchesPlayed}</td>
              <td className={`${TD} font-semibold text-brand-ink`}>{team.wins}</td>
              <td className={`${TD} text-gray-500`}>{team.losses}</td>
              {isVolleyball && <>
                <td className={`${TD} text-gray-500`}>{team.setWins}</td>
                <td className={`${TD} text-gray-500`}>{team.setLosses}</td>
              </>}
              <td className={`${TD} text-gray-500`}>{team.pointsFor}</td>
              <td className={`${TD} text-gray-500`}>{team.pointsAgainst}</td>
              <td className={`${TD} text-gray-500`}>{pd > 0 ? '+' : ''}{pd}</td>
              {isVolleyball && <td className={`${TD} font-bold text-brand-ink`}>{computePts(team, method)}</td>}
            </tr>
          )
        })}
      </tbody>
    </TableFrame>
  )
}
