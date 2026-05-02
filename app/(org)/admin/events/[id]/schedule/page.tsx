import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { getAdminScope } from '@/lib/admin-scope'
import { AddGameForm } from '@/components/schedule/add-game-form'
import { AssignSlotsCard } from '@/components/schedule/assign-slots-card'
import { InsertBreakForm } from '@/components/schedule/insert-break-form'
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: games }, { data: teams }, { data: league }] = await Promise.all([
    // Cast to any — Supabase types may not yet reflect home_team_label/away_team_label columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('games')
      .select(`
        id, scheduled_at, court, week_number, status, cancellation_reason,
        home_team_id, away_team_id,
        home_team_label, away_team_label,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('leagues')
      .select('sport, max_participants')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
  ])

  const sport = league?.sport ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxParticipants: number | null = (league as any)?.max_participants ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedGames = (games ?? []).map((game: any) => {
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
      homeTeamLabel: game.home_team_label ?? null,
      awayTeamLabel: game.away_team_label ?? null,
      homeTeamName: home?.name ?? game.home_team_label ?? 'TBD',
      awayTeamName: away?.name ?? game.away_team_label ?? 'TBD',
      dateLabel,
      timeLabel,
      // YYYY-MM-DD in org timezone — used for "Print Day" URL param
      dateKey: game.scheduled_at
        ? new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(game.scheduled_at))
        : '',
      status: game.status ?? 'scheduled',
      cancellationReason: game.cancellation_reason ?? null,
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

  // Collect unique unmatched slot labels from the current game list
  const slotLabelSet = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(mappedGames as any[]).forEach((g: any) => {
    if (!g.homeTeamId && g.homeTeamLabel) slotLabelSet.add(g.homeTeamLabel)
    if (!g.awayTeamId && g.awayTeamLabel) slotLabelSet.add(g.awayTeamLabel)
  })
  const slotLabels = Array.from(slotLabelSet).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Game list */}
      <div className="md:col-span-2">
        <ScheduleTable
          games={mappedGames}
          teams={teams ?? []}
          leagueId={id}
          sport={sport}
          timezone={timezone}
        />
      </div>

      {/* Sidebar tools — org admins only */}
      {isOrgAdmin && (
        <div className="space-y-4">
          {/* Slot assignment — shown when template games exist and real teams are available */}
          <AssignSlotsCard leagueId={id} slotLabels={slotLabels} teams={teams ?? []} />
          <RoundRobinGenerator leagueId={id} teamCount={(teams ?? []).length} maxTeams={maxParticipants} />
          <AddGameForm leagueId={id} sport={sport} teams={teams ?? []} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <InsertBreakForm leagueId={id} gameTimes={(mappedGames as any[]).map((g: any) => g.scheduledAt as string).filter(Boolean)} />
          <ScheduleImport leagueId={id} />
        </div>
      )}
    </div>
  )
}
