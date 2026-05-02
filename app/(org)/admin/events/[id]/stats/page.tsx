import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getStatDefinitions, getGameStats } from '@/actions/stats'
import { StatsEntryTable } from '@/components/stats/stats-entry-table'
import type { GameForStats } from '@/components/stats/stats-entry-table'
import type { RosterMember } from '@/components/stats/game-stats-sheet'
import { formatGameTime } from '@/lib/format-time'

export default async function AdminStatsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const service = createServiceRoleClient()

  const [{ data: league }, { data: branding }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('leagues')
      .select('id, name, sport')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
    supabase
      .from('org_branding')
      .select('timezone')
      .eq('organization_id', org.id)
      .single(),
  ])

  const sport: string = league?.sport ?? ''
  const timezone = branding?.timezone ?? 'America/Toronto'

  // Fetch stat definitions for this sport
  const statDefs = await getStatDefinitions(org.id, sport)

  // Fetch completed/played games with team names and results
  const { data: games } = await service
    .from('games')
    .select(`
      id, scheduled_at, week_number,
      home_team_id, away_team_id,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      game_results(status)
    `)
    .eq('league_id', id)
    .eq('organization_id', org.id)
    .eq('status', 'completed')
    .order('scheduled_at', { ascending: false })

  // Fetch all team members for all teams in this league
  const { data: teamMembersRaw } = await service
    .from('team_members')
    .select(`
      team_id, user_id, role,
      profile:profiles!team_members_user_id_fkey(full_name, avatar_url)
    `)
    .eq('organization_id', org.id)
    .in('team_id', (games ?? []).flatMap(g => [g.home_team_id, g.away_team_id]).filter(Boolean) as string[])

  // Build team map: teamId → { id, name, members[] }
  const teamMap: Record<string, { id: string; name: string; members: RosterMember[] }> = {}
  for (const game of games ?? []) {
    const home = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
    const away = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
    if (home && !teamMap[home.id]) teamMap[home.id] = { id: home.id, name: home.name, members: [] }
    if (away && !teamMap[away.id]) teamMap[away.id] = { id: away.id, name: away.name, members: [] }
  }
  for (const tm of teamMembersRaw ?? []) {
    const profile = Array.isArray(tm.profile) ? tm.profile[0] : tm.profile
    if (teamMap[tm.team_id]) {
      teamMap[tm.team_id].members.push({
        userId: tm.user_id ?? '',
        name: (profile as { full_name?: string | null } | null)?.full_name ?? 'Unknown',
        avatarUrl: (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
      })
    }
  }

  // Build game list for the table
  const gameList: GameForStats[] = (games ?? []).map(game => {
    const home = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
    const away = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
    const { date, time } = formatGameTime(game.scheduled_at, timezone)
    const weekLabel = game.week_number ? `Week ${game.week_number} · ` : ''
    return {
      id: game.id,
      label: `${weekLabel}${date} · ${time}`,
      homeTeamId: game.home_team_id ?? '',
      homeTeamName: home?.name ?? 'TBD',
      awayTeamId: game.away_team_id ?? '',
      awayTeamName: away?.name ?? 'TBD',
      hasStats: false, // will populate below
    }
  })

  // Fetch existing stats for all games to mark hasStats and pre-populate sheet
  const allGameStats: Record<string, Record<string, Record<string, number>>> = {}
  const gameIds = gameList.map(g => g.id)

  if (gameIds.length > 0) {
    await Promise.all(
      gameIds.map(async gameId => {
        allGameStats[gameId] = await getGameStats(gameId, org.id)
      })
    )
  }

  // Mark games that already have stats
  for (const game of gameList) {
    game.hasStats = Object.keys(allGameStats[game.id] ?? {}).length > 0
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Player Stats</h2>
          {statDefs.length > 0 ? (
            <p className="text-sm text-gray-500 mt-0.5">
              Tracking: {statDefs.map(d => d.label).join(', ')}
            </p>
          ) : (
            <p className="text-sm text-amber-600 mt-0.5">
              No stat categories defined for{' '}
              <span className="font-medium capitalize">{sport || 'this sport'}</span>.
              Contact support to add stats for your sport.
            </p>
          )}
        </div>
      </div>

      {/* Game list */}
      <StatsEntryTable
        leagueId={id}
        games={gameList}
        teams={teamMap}
        statDefs={statDefs}
        allGameStats={allGameStats}
      />
    </div>
  )
}
