import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
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
  const db = createServiceRoleClient()
  const scope = await getAdminScope(org.id)
  const isOrgAdmin = scope.isOrgAdmin

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: branding } = await (db as any)
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: games }, { data: teams }, { data: league }, { data: pools }] = await Promise.all([
    // Cast to any — Supabase types may not yet reflect home_team_label/away_team_label columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('games')
      .select(`
        id, scheduled_at, court, week_number, status, cancellation_reason,
        home_team_id, away_team_id, pool_id,
        home_team_label, away_team_label,
        home_team:teams!games_home_team_id_fkey(name),
        away_team:teams!games_away_team_id_fkey(name),
        pool:pools!games_pool_id_fkey(name),
        game_results(home_score, away_score, status, sets)
      `)
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('scheduled_at', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('teams')
      .select('id, name')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('leagues')
      .select('sport, max_participants, schedule_published')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('pools')
      .select('id, name')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('sort_order', { ascending: true }),
  ])

  const sport = league?.sport ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxParticipants: number | null = (league as any)?.max_participants ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schedulePublished: boolean = (league as any)?.schedule_published ?? false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedGames = (games ?? []).map((game: any) => {
    const home = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
    const away = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
    const pool = Array.isArray(game.pool) ? game.pool[0] : game.pool
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
      poolId: game.pool_id ?? null,
      poolName: pool?.name ?? null,
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
          pools={pools ?? []}
          leagueId={id}
          sport={sport}
          timezone={timezone}
          schedulePublished={schedulePublished}
          isAdmin={isOrgAdmin}
        />
      </div>

      {/* Sidebar tools — org admins only */}
      {isOrgAdmin && (
        <div className="space-y-4">
          {/* Slot assignment — shown when template games exist and real teams are available */}
          <AssignSlotsCard leagueId={id} slotLabels={slotLabels} teams={teams ?? []} />
          <RoundRobinGenerator leagueId={id} teamCount={(teams ?? []).length} maxTeams={maxParticipants} sport={sport} />
          <AddGameForm leagueId={id} sport={sport} teams={teams ?? []} pools={pools ?? []} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <InsertBreakForm leagueId={id} gameTimes={(mappedGames as any[]).map((g: any) => g.scheduledAt as string).filter(Boolean)} />
          <ScheduleImport leagueId={id} sport={sport} pools={pools ?? []} />
        </div>
      )}
    </div>
  )
}
