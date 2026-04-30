import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { getAdminScope } from '@/lib/admin-scope'
import { AddGameForm } from '@/components/schedule/add-game-form'
import { ScheduleImport } from '@/components/schedule/schedule-import'
import { RoundRobinGenerator } from '@/components/schedule/round-robin-generator'
import { ScheduleTable } from '@/components/schedule/schedule-table'
import { formatGameTime } from '@/lib/format-time'

export default async function AdminSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const scope = await getAdminScope(org.id)
  const isOrgAdmin = scope.isOrgAdmin

  const { data: branding } = await supabase
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  const [{ data: games }, { data: teams }, { data: league }] = await Promise.all([
    supabase
      .from('games')
      .select(`
        id, scheduled_at, court, week_number, status,
        home_team_id, away_team_id,
        home_team:teams!games_home_team_id_fkey(name),
        away_team:teams!games_away_team_id_fkey(name),
        game_results(home_score, away_score, status, sets)
      `)
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('teams')
      .select('id, name')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('name'),
    supabase
      .from('leagues')
      .select('sport')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
  ])

  const sport = league?.sport ?? ''

  const mappedGames = (games ?? []).map((game) => {
    const home = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
    const away = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
    const result = Array.isArray(game.game_results) ? game.game_results[0] : game.game_results
    const { date: dateLabel, time: timeLabel } = formatGameTime(game.scheduled_at, timezone)

    return {
      id: game.id,
      scheduledAt: game.scheduled_at,
      court: game.court,
      weekNumber: game.week_number,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      homeTeamName: home?.name ?? 'TBD',
      awayTeamName: away?.name ?? 'TBD',
      dateLabel,
      timeLabel,
      result: result
        ? {
            homeScore: result.home_score,
            awayScore: result.away_score,
            status: result.status,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sets: (result as any).sets ?? null,
          }
        : null,
    }
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Game list */}
      <div className="md:col-span-2">
        <ScheduleTable
          games={mappedGames}
          teams={teams ?? []}
          leagueId={id}
          sport={sport}
        />
      </div>

      {/* Sidebar tools — org admins only */}
      {isOrgAdmin && (
        <div className="space-y-4">
          <RoundRobinGenerator leagueId={id} teamCount={(teams ?? []).length} />
          <AddGameForm leagueId={id} teams={teams ?? []} />
          <ScheduleImport leagueId={id} />
        </div>
      )}
    </div>
  )
}
