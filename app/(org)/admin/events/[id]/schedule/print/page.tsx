import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { parseLocalToUtc, formatGameTime } from '@/lib/format-time'
import { getScoreStructure } from '@/lib/print-config'
import { getStatDefinitions } from '@/actions/stats'
import { PrintControls } from '@/components/print/print-controls'
import { DailyScheduleSheet } from '@/components/print/daily-schedule-sheet'
import { FullScheduleSheet } from '@/components/print/full-schedule-sheet'
import { GameScoreSheet } from '@/components/print/game-score-sheet'
import { GameStatSheet } from '@/components/print/game-stat-sheet'

export default async function SchedulePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string; date?: string; gameId?: string; gameIds?: string }>
}) {
  const { id } = await params
  const { type, date, gameId, gameIds } = await searchParams

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const scope = await getAdminScope(org.id)
  if (!scope.isOrgAdmin) notFound()

  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  // Org branding (timezone + org name)
  const [{ data: branding }, { data: orgRow }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('organizations').select('name').eq('id', org.id).single(),
  ])
  const timezone = branding?.timezone ?? 'America/Toronto'
  const orgName = orgRow?.name ?? 'Fieldday'

  // League info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('name, sport')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!league) notFound()
  const leagueName: string = league.name ?? 'League'
  const sport: string = league.sport ?? ''

  // ─── Full Schedule (all games) ─────────────────────────────────────────────
  if (type === 'full') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawGames } = await (db as any)
      .from('games')
      .select(`
        id, scheduled_at, court, week_number,
        home_team_label, away_team_label,
        home_team:teams!games_home_team_id_fkey(name),
        away_team:teams!games_away_team_id_fkey(name)
      `)
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .neq('status', 'cancelled')
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
        <FullScheduleSheet
          games={games}
          leagueName={leagueName}
          orgName={orgName}
          timezone={timezone}
          sport={sport}
        />
      </PrintPage>
    )
  }

  // ─── Daily Schedule ────────────────────────────────────────────────────────
  if (type === 'schedule' && date) {
    const dayStart = parseLocalToUtc(date, '00:00', timezone)
    const dayEnd   = parseLocalToUtc(date, '23:59', timezone)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawGames } = await (db as any)
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

  // ─── Bulk Score Sheets ────────────────────────────────────────────────────
  if (type === 'scoresheet' && gameIds) {
    const ids = gameIds.split(',').filter(Boolean).slice(0, 60)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawGames } = await (db as any)
      .from('games')
      .select(`
        id, scheduled_at, court, week_number,
        home_team_label, away_team_label,
        home_team:teams!games_home_team_id_fkey(id, name),
        away_team:teams!games_away_team_id_fkey(id, name)
      `)
      .in('id', ids)
      .eq('organization_id', org.id)
      .order('scheduled_at', { ascending: true })

    type BulkGame = { id: string; scheduledAt: string; court: string | null; weekNumber: number | null; homeTeamName: string; awayTeamName: string }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bulkGames: BulkGame[] = (rawGames ?? []).map((g: any) => {
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

    const scoreStructure = getScoreStructure(sport)

    return (
      <PrintPage>
        <PrintControls />
        {bulkGames.map((game, i) => (
          <div key={game.id} style={i < bulkGames.length - 1 ? { breakAfter: 'page' } : {}}>
            <GameScoreSheet
              game={game}
              scoreStructure={scoreStructure}
              leagueName={leagueName}
              orgName={orgName}
              timezone={timezone}
            />
          </div>
        ))}
      </PrintPage>
    )
  }

  // ─── Score Sheet or Stat Sheet ─────────────────────────────────────────────
  if ((type === 'scoresheet' || type === 'statsheet') && gameId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawGame } = await (db as any)
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
      const { data } = await db
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
          @page { size: letter portrait; margin: 0; }

          html, body {
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
            background: white !important;
          }

          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }

          .print-page-wrapper {
            max-width: none !important;
            padding: 0.5in !important;
            margin: 0 !important;
          }

          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="print-page-wrapper max-w-[8.5in] mx-auto p-8">
        {children}
      </div>
    </>
  )
}
