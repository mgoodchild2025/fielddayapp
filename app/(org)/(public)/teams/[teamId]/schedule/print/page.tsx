import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { PrintControls } from '@/components/print/print-controls'
import { FullScheduleSheet } from '@/components/print/full-schedule-sheet'

export default async function TeamSchedulePrintPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Parallel: branding, team info, user's team membership, org admin check
  const [{ data: branding }, { data: orgRow }, { data: team }, { data: myMembership }, { data: orgMember }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('organizations').select('name').eq('id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('teams')
      .select('id, name, league_id, league:leagues!teams_league_id_fkey(name, sport)')
      .eq('id', teamId)
      .eq('organization_id', org.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_members')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!team) notFound()

  const isOrgAdmin = ['org_admin', 'league_admin'].includes(orgMember?.role ?? '')
  if (!myMembership && !isOrgAdmin) notFound()

  const timezone = branding?.timezone ?? 'America/Toronto'
  const orgName = orgRow?.name ?? 'Fieldday'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const league = Array.isArray((team as any).league) ? (team as any).league[0] : (team as any).league
  const leagueName: string = league?.name ?? team.name
  const sport: string = league?.sport ?? ''

  // Fetch ALL future games involving this team (no past cutoff for printing)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawGames } = await (db as any)
    .from('games')
    .select(`
      id, scheduled_at, court, week_number, status,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      league:leagues!games_league_id_fkey(schedule_published)
    `)
    .eq('organization_id', org.id)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true })

  // Filter out unpublished schedules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games = (rawGames ?? []).filter((g: any) => {
    const gl = Array.isArray(g.league) ? g.league[0] : g.league
    return gl?.schedule_published !== false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }).map((g: any) => {
    const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
    const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
    return {
      id: g.id,
      scheduledAt: g.scheduled_at,
      court: g.court ?? null,
      weekNumber: g.week_number ?? null,
      homeTeamName: homeTeam?.name ?? 'TBD',
      awayTeamName: awayTeam?.name ?? 'TBD',
      highlightHome: homeTeam?.id === teamId,
      highlightAway: awayTeam?.id === teamId,
    }
  })

  return (
    <>
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.5in; }
          html, body { overflow: visible !important; height: auto !important; width: 100% !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .print-page-wrapper { max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="print-page-wrapper max-w-[8.5in] mx-auto p-8">
        <PrintControls />
        <FullScheduleSheet
          games={games}
          leagueName={leagueName}
          orgName={orgName}
          timezone={timezone}
          sport={sport}
          teamName={team.name}
        />
      </div>
    </>
  )
}
