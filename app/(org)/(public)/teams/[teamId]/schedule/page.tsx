import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { PastGamesToggle } from '@/components/schedule/past-games-toggle'
import { formatGameTime } from '@/lib/format-time'

export default async function TeamSchedulePage({
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
  const [{ data: branding }, { data: team }, { data: myMembership }, { data: orgMember }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('teams')
      .select('id, name, color, logo_url')
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

  // Must be a team member or org/league admin
  const isOrgAdmin = ['org_admin', 'league_admin'].includes(orgMember?.role ?? '')
  if (!myMembership && !isOrgAdmin) notFound()

  const timezone = branding?.timezone ?? 'America/Toronto'
  const pastBound = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date().toISOString()

  // Fetch all games involving this team within the 60-day lookback window
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawGames } = await (db as any)
    .from('games')
    .select(`
      id, scheduled_at, court, week_number, status,
      home_team:teams!games_home_team_id_fkey(id, name, color),
      away_team:teams!games_away_team_id_fkey(id, name, color),
      league:leagues!games_league_id_fkey(name, slug, schedule_published)
    `)
    .eq('organization_id', org.id)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .gte('scheduled_at', pastBound)
    .order('scheduled_at', { ascending: true })

  // Filter out unpublished league schedules (same pattern as /schedule page)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games = (rawGames ?? []).filter((g: any) => {
    const league = Array.isArray(g.league) ? g.league[0] : g.league
    return league?.schedule_published !== false
  })

  const upcomingGames = games.filter((g) => g.scheduled_at >= nowIso)
  const pastGames = games.filter((g) => g.scheduled_at < nowIso).reverse()

  // ── Game card renderer ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderGame(g: any) {
    const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
    const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
    const league   = Array.isArray(g.league)    ? g.league[0]    : g.league
    const { date: gameDate, time: gameTime } = formatGameTime(g.scheduled_at, timezone)
    const homeColor = homeTeam?.color as string | null | undefined
    const awayColor = awayTeam?.color as string | null | undefined
    // Bold whichever side is this team
    const isHomeThisTeam = homeTeam?.id === teamId
    const isAwayThisTeam = awayTeam?.id === teamId
    const isCancelled = g.status === 'cancelled' || g.status === 'postponed'

    return (
      <div
        key={g.id}
        className={`relative border rounded-md p-3 transition-shadow hover:shadow-md bg-white${isCancelled ? ' opacity-60' : ''}`}
      >
        {league?.slug && (
          <Link
            href={`/events/${league.slug}`}
            className="absolute inset-0 rounded-md"
            aria-label={`View ${league.name ?? 'event'}`}
          />
        )}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-gray-500">
            {gameDate} · {gameTime}
            {g.court ? ` · Court ${g.court}` : ''}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {isCancelled ? (
              <span className="text-xs font-medium text-red-500 bg-red-50 rounded px-1.5 py-0.5 leading-tight">
                {g.status === 'postponed' ? 'Postponed' : 'Cancelled'}
              </span>
            ) : g.week_number != null ? (
              <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 leading-tight">
                Wk {g.week_number}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap mt-0.5">
          {homeColor && (
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: homeColor }} />
          )}
          <span className={isHomeThisTeam ? 'font-semibold' : 'font-medium'}>
            {homeTeam?.name ?? 'TBD'}
          </span>
          <span className="text-gray-400 text-sm mx-0.5">vs</span>
          {awayColor && (
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: awayColor }} />
          )}
          <span className={isAwayThisTeam ? 'font-semibold' : 'font-medium'}>
            {awayTeam?.name ?? 'TBD'}
          </span>
        </div>
        {league?.name && (
          <p className="text-xs text-gray-400 mt-0.5">{league.name}</p>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 flex-1">

        <Link href={`/teams/${teamId}`} className="text-sm text-gray-500 hover:underline">
          ← {team.name}
        </Link>

        <h1
          className="text-2xl font-bold uppercase mt-4 mb-6"
          style={{ fontFamily: 'var(--brand-heading-font)' }}
        >
          Schedule
        </h1>

        {/* Upcoming games */}
        <div className="space-y-2">
          {upcomingGames.length > 0
            ? upcomingGames.map(renderGame)
            : (
              <div className="border rounded-md p-6 text-center text-sm text-gray-400 bg-white">
                No upcoming games scheduled yet.
              </div>
            )
          }
        </div>

        {/* Past games — collapsed by default */}
        {pastGames.length > 0 && (
          <PastGamesToggle count={pastGames.length} label="games">
            <div className="space-y-2">
              {pastGames.map(renderGame)}
            </div>
          </PastGamesToggle>
        )}

      </div>
      <Footer org={org} />
    </div>
  )
}
