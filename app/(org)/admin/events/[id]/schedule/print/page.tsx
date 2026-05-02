import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { getAdminScope } from '@/lib/admin-scope'
import { parseLocalToUtc, formatGameTime } from '@/lib/format-time'
import { getScoreStructure } from '@/lib/print-config'
import { getStatDefinitions } from '@/actions/stats'
import { PrintControls } from '@/components/print/print-controls'
import { DailyScheduleSheet } from '@/components/print/daily-schedule-sheet'
import { GameScoreSheet } from '@/components/print/game-score-sheet'
import { GameStatSheet } from '@/components/print/game-stat-sheet'

export default async function SchedulePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string; date?: string; gameId?: string }>
}) {
  const { id } = await params
  const { type, date, gameId } = await searchParams

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const scope = await getAdminScope(org.id)
  if (!scope.isOrgAdmin) notFound()

  const supabase = await createServerClient()

  // Org branding (timezone + org name)
  const [{ data: branding }, { data: orgRow }] = await Promise.all([
    supabase.from('org_branding').select('timezone').eq('organization_id', org.id).single(),
    supabase.from('organizations').select('name').eq('id', org.id).single(),
  ])
  const timezone = branding?.timezone ?? 'America/Toronto'
  const orgName = orgRow?.name ?? 'Fieldday'

  // League info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (supabase as any)
    .from('leagues')
    .select('name, sport')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!league) notFound()
  const leagueName: string = league.name ?? 'League'
  const sport: string = league.sport ?? ''

  // ─── Daily Schedule ────────────────────────────────────────────────────────
  if (type === 'schedule' && date) {
    const dayStart = parseLocalToUtc(date, '00:00', timezone)
    const dayEnd   = parseLocalToUtc(date, '23:59', timezone)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawGames } = await (supabase as any)
      .from('games')
      .select(`
        id, scheduled_at, court, week_number,
        home_team_label, away_team_label,
        home_team:teams!games_home_team_id_fkey(name),
        away_team:teams!games_away_team_id_fkey(name)
      `)
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .gte('scheduled_at', dayStart)
      .lte('scheduled_at', dayEnd)
      .order('scheduled_at', { ascending: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const games = (rawGames ?? []).map((g: any) => {
      const home = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
      const away = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
      return {
        id: g.id,
        scheduledAt: g.scheduled_at,
        court: g.court ?? null,
        weekNumber: g.week_number ?? null,
        homeTeamName: home?.name ?? g.home_team_label ?? 'TBD',
        awayTeamName: away?.name ?? g.away_team_label ?? 'TBD',
      }
    })

    return (
      <PrintPage>
        <PrintControls />
        <DailyScheduleSheet
          games={games}
          date={date}
          leagueName={leagueName}
          orgName={orgName}
          timezone={timezone}
          sport={sport}
        />
      </PrintPage>
    )
  }

  // ─── Score Sheet or Stat Sheet ─────────────────────────────────────────────
  if ((type === 'scoresheet' || type === 'statsheet') && gameId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawGame } = await (supabase as any)
      .from('games')
      .select(`
        id, scheduled_at, court, week_number,
        home_team_id, away_team_id,
        home_team_label, away_team_label,
        home_team:teams!games_home_team_id_fkey(id, name),
        away_team:teams!games_away_team_id_fkey(id, name)
      `)
      .eq('id', gameId)
      .eq('organization_id', org.id)
      .single()

    if (!rawGame) notFound()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = rawGame as any
    const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
    const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
    const homeTeamId: string | null = homeTeam?.id ?? g.home_team_id ?? null
    const awayTeamId: string | null = awayTeam?.id ?? g.away_team_id ?? null

    const game = {
      id: g.id,
      scheduledAt: g.scheduled_at,
      court: g.court ?? null,
      weekNumber: g.week_number ?? null,
      homeTeamName: homeTeam?.name ?? g.home_team_label ?? 'TBD',
      awayTeamName: awayTeam?.name ?? g.away_team_label ?? 'TBD',
    }

    // Fetch rosters in parallel (only if real teams are assigned)
    async function fetchRoster(teamId: string | null) {
      if (!teamId) return []
      const { data } = await supabase
        .from('team_members')
        .select('position, profile:profiles!team_members_user_id_fkey(full_name)')
        .eq('team_id', teamId)
        .eq('organization_id', org.id)
        .eq('status', 'active')
        .order('role', { ascending: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((m: any) => {
        const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
        return { name: profile?.full_name ?? 'Unknown', position: m.position ?? null }
      })
    }

    const [homeRoster, awayRoster, statDefs] = await Promise.all([
      fetchRoster(homeTeamId),
      fetchRoster(awayTeamId),
      type === 'statsheet' ? getStatDefinitions(org.id, sport) : Promise.resolve([]),
    ])

    if (type === 'scoresheet') {
      const scoreStructure = getScoreStructure(sport)
      return (
        <PrintPage>
          <PrintControls />
          <GameScoreSheet
            game={game}
            scoreStructure={scoreStructure}
            leagueName={leagueName}
            orgName={orgName}
            timezone={timezone}
          />
        </PrintPage>
      )
    }

    // statsheet
    return (
      <PrintPage>
        <PrintControls />
        <GameStatSheet
          game={game}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          statDefs={statDefs}
          leagueName={leagueName}
          orgName={orgName}
          timezone={timezone}
        />
      </PrintPage>
    )
  }

  notFound()
}

// Minimal wrapper with print CSS
function PrintPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.75in; }
          body  { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="max-w-[8.5in] mx-auto p-8">
        {children}
      </div>
    </>
  )
}
