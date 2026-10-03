import Link from 'next/link'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { StandingsRow } from '@/components/events/standings-row'
import { computePts, sortStandings, VOLLEYBALL_SPORTS, type PtsMethod, type VolleyballMode, type TeamStat } from '@/lib/standings'

/**
 * Public event standings table (sets table for set-based volleyball, match
 * table otherwise). Phones show only the columns that decide the order —
 * rank rides in the team cell and a row tap (StandingsRow) opens the rest —
 * so nothing scrolls sideways; from sm up it's the full table with Rank +
 * Team pinned.
 */

function Legend({ items }: { items: { abbr: string; label: string; wide?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
      {items.map(({ abbr, label, wide }) => (
        <span key={abbr} className={`text-xs text-gray-500 ${wide ? 'hidden sm:inline' : ''}`}>
          <span className="font-semibold text-gray-500">{abbr}</span> = {label}
        </span>
      ))}
    </div>
  )
}

// Standings cells shared by both tables. Rank is its own pinned column from
// sm up; on phones it rides inside the team cell to save a column.
function RankCell({ rank }: { rank: number }) {
  return (
    <td className={`hidden sm:table-cell sm:sticky sm:left-0 sm:z-[1] bg-inherit px-4 py-3 text-xs tabular-nums ${rank <= 3 ? 'font-bold text-gray-700' : 'text-gray-500'}`}>{rank}</td>
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

function TeamCell({ team, rank, streak }: { team: { id: string; name: string; logoUrl?: string | null; color?: string | null }; rank: number; streak?: string | null }) {
  return (
    // w-full + max-w-0 on phones: the team column takes what's left and the
    // name truncates, instead of pushing the numbers off-screen.
    <td className="w-full max-w-0 sm:w-auto sm:max-w-none sm:sticky sm:left-14 sm:z-[1] bg-inherit sm:shadow-[1px_0_0_rgb(0_0_0/0.06)] pl-2.5 pr-1.5 sm:px-4 py-3 font-medium">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <span className={`sm:hidden w-3.5 shrink-0 text-xs tabular-nums ${rank <= 3 ? 'font-bold text-gray-700' : 'text-gray-500'}`}>{rank}</span>
        <Link href={`/teams/${team.id}/stats`} prefetch={false} className="flex items-center gap-1.5 sm:gap-2 min-w-0 hover:underline">
          {/* 24px logo on phones, 32px from sm — every pixel goes to the name. */}
          <TeamAvatar logoUrl={team.logoUrl ?? null} color={team.color ?? null} name={team.name} size="sm" className="max-sm:w-6 max-sm:h-6 max-sm:text-xs" />
          <span className="truncate">{team.name}</span>
        </Link>
        {streak && <span className="hidden sm:inline-flex shrink-0"><StreakBadge streak={streak} /></span>}
      </div>
    </td>
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
      { abbr: 'MP', label: 'Matches Played', wide: true },
      { abbr: 'SW', label: 'Sets Won' },
      { abbr: 'SL', label: 'Sets Lost' },
      { abbr: 'SPF', label: 'Set Points For (total points scored)', wide: true },
      { abbr: 'SPA', label: 'Set Points Against (total points allowed)', wide: true },
      { abbr: 'PD', label: 'Point Differential (SPF − SPA)' },
    ]
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            {/* Phones: the deciding columns only (tap a row for the rest); sm+: everything. */}
            <table className="text-sm w-full sm:w-auto sm:min-w-[480px]">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="hidden sm:table-cell sm:sticky sm:left-0 sm:z-[1] bg-inherit px-4 py-3 font-medium text-gray-500 w-14 text-xs uppercase tracking-wide">RANK</th>
                  <th className="w-full max-w-0 sm:w-auto sm:max-w-none sm:sticky sm:left-14 sm:z-[1] bg-inherit sm:shadow-[1px_0_0_rgb(0_0_0/0.06)] pl-2.5 pr-1.5 sm:px-4 py-3 font-medium text-gray-500 sm:min-w-[120px]">Team</th>
                  <th className="hidden sm:table-cell px-3 py-3 font-medium text-gray-500 text-center">MP</th>
                  <th className="px-1.5 sm:px-3 py-3 font-medium text-gray-500 text-center">SW</th>
                  <th className="px-1.5 sm:px-3 py-3 font-medium text-gray-500 text-center">SL</th>
                  <th className="hidden sm:table-cell px-3 py-3 font-medium text-gray-500 text-center">SPF</th>
                  <th className="hidden sm:table-cell px-3 py-3 font-medium text-gray-500 text-center">SPA</th>
                  <th className="px-1.5 sm:px-3 py-3 font-medium text-gray-500 text-center">PD</th>
                  <th className="sm:hidden w-7" aria-label="Details" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((team, i) => {
                  const pd = team.pointsFor - team.pointsAgainst
                  return (
                    <StandingsRow
                      key={team.id}
                      striped={i % 2 === 1}
                      teamHref={`/teams/${team.id}/stats`}
                    teamName={team.name}
                      details={[
                        { label: 'Played', value: team.matchesPlayed },
                        { label: 'Set pts for', value: team.pointsFor },
                        { label: 'Set pts against', value: team.pointsAgainst },
                      ]}
                    >
                      <RankCell rank={i + 1} />
                      <TeamCell team={team} rank={i + 1} />
                      <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-500">{team.matchesPlayed}</td>
                      <td className="px-1.5 sm:px-3 py-3 text-center font-semibold text-brand-primary tabular-nums">{team.setWins}</td>
                      <td className="px-1.5 sm:px-3 py-3 text-center text-gray-500 tabular-nums">{team.setLosses}</td>
                      <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-500">{team.pointsFor}</td>
                      <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-500">{team.pointsAgainst}</td>
                      <td className="px-1.5 sm:px-3 py-3 text-center text-gray-500 tabular-nums">{pd > 0 ? '+' : ''}{pd}</td>
                    </StandingsRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <Legend items={legend} />
      </div>
    )
  }

  // ── Match-based table (default, also used for non-volleyball sports) ────────
  const ptsLabel = {
    wins: 'Match Wins',
    set_wins: 'Set Wins (SW)',
    set_differential: 'Set Differential (SW − SL)',
    points_for: 'Points For (PF)',
  }[method]

  const legend: { abbr: string; label: string; wide?: boolean }[] = [
    { abbr: 'MP', label: 'Matches Played', wide: true },
    { abbr: 'W', label: 'Match Wins' },
    { abbr: 'L', label: 'Match Losses' },
    ...(isVolleyball ? [
      { abbr: 'SW', label: 'Sets Won', wide: true },
      { abbr: 'SL', label: 'Sets Lost', wide: true },
    ] : []),
    { abbr: 'PF', label: isVolleyball ? 'Points For (set-level)' : 'Points For', wide: true },
    { abbr: 'PA', label: isVolleyball ? 'Points Against (set-level)' : 'Points Against', wide: true },
    { abbr: 'PD', label: 'Point Differential (PF − PA)' },
    ...(isVolleyball ? [{ abbr: 'PTS', label: `Standings Points — ${ptsLabel}` }] : []),
  ]


  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          {/* Phones: the deciding columns only (tap a row for the rest); sm+: everything. */}
          <table className={`text-sm w-full sm:w-auto ${isVolleyball ? 'sm:min-w-[620px]' : 'sm:min-w-[420px]'}`}>
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="hidden sm:table-cell sm:sticky sm:left-0 sm:z-[1] bg-inherit px-4 py-3 font-medium text-gray-500 w-14 text-xs uppercase tracking-wide">RANK</th>
                <th className="w-full max-w-0 sm:w-auto sm:max-w-none sm:sticky sm:left-14 sm:z-[1] bg-inherit sm:shadow-[1px_0_0_rgb(0_0_0/0.06)] pl-2.5 pr-1.5 sm:px-4 py-3 font-medium text-gray-500 sm:min-w-[120px]">Team</th>
                <th className="hidden sm:table-cell px-3 py-3 font-medium text-gray-500 text-center">MP</th>
                <th className="px-1.5 sm:px-3 py-3 font-medium text-gray-500 text-center">W</th>
                <th className="px-1.5 sm:px-3 py-3 font-medium text-gray-500 text-center">L</th>
                {isVolleyball && <>
                  <th className="hidden sm:table-cell px-3 py-3 font-medium text-gray-500 text-center">SW</th>
                  <th className="hidden sm:table-cell px-3 py-3 font-medium text-gray-500 text-center">SL</th>
                </>}
                <th className="hidden sm:table-cell px-3 py-3 font-medium text-gray-500 text-center">PF</th>
                <th className="hidden sm:table-cell px-3 py-3 font-medium text-gray-500 text-center">PA</th>
                <th className="px-1.5 sm:px-3 py-3 font-medium text-gray-500 text-center">PD</th>
                {isVolleyball && <th className="px-1.5 sm:px-3 py-3 font-medium text-gray-500 text-center">PTS</th>}
                <th className="sm:hidden w-7" aria-label="Details" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((team, i) => {
                const pd = team.pointsFor - team.pointsAgainst
                const pts = computePts(team, method)
                return (
                  <StandingsRow
                    key={team.id}
                    striped={i % 2 === 1}
                    teamHref={`/teams/${team.id}/stats`}
                    teamName={team.name}
                    details={[
                      { label: 'Played', value: team.matchesPlayed },
                      ...(isVolleyball ? [
                        { label: 'Sets won', value: team.setWins },
                        { label: 'Sets lost', value: team.setLosses },
                      ] : []),
                      { label: 'Points for', value: team.pointsFor },
                      { label: 'Points against', value: team.pointsAgainst },
                      ...(team.streak ? [{ label: 'Streak', value: <StreakBadge streak={team.streak} /> }] : []),
                    ]}
                  >
                    <RankCell rank={i + 1} />
                    <TeamCell team={team} rank={i + 1} streak={team.streak} />
                    <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-500">{team.matchesPlayed}</td>
                    <td className="px-1.5 sm:px-3 py-3 text-center font-semibold text-brand-primary tabular-nums">{team.wins}</td>
                    <td className="px-1.5 sm:px-3 py-3 text-center text-gray-500 tabular-nums">{team.losses}</td>
                    {isVolleyball && <>
                      <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-500">{team.setWins}</td>
                      <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-500">{team.setLosses}</td>
                    </>}
                    <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-500">{team.pointsFor}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-500">{team.pointsAgainst}</td>
                    <td className="px-1.5 sm:px-3 py-3 text-center tabular-nums text-gray-500">{pd > 0 ? '+' : ''}{pd}</td>
                    {isVolleyball && (
                      <td className="px-1.5 sm:px-3 py-3 text-center font-bold text-brand-primary tabular-nums">
                        {pts}
                      </td>
                    )}
                  </StandingsRow>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Legend items={legend} />
    </div>
  )
}
