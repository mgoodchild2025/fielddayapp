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
      league:leagues!games_league_id_fkey(name, slug, schedule_published, event_type)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcomingGames = games.filter((g: any) => g.scheduled_at >= nowIso)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pastGames = games.filter((g: any) => g.scheduled_at < nowIso).reverse()

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
            ) : g.week_number != null && league?.event_type !== 'tournament' ? (
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

        <div className="flex items-center justify-between">
          <Link href={`/teams/${teamId}`} className="text-sm text-gray-500 hover:underline">
            ← {team.name}
          </Link>
          <a
            href={`/teams/${teamId}/schedule/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            title="Print team schedule"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0118 8.653v4.097A2.25 2.25 0 0115.75 15h-.241l.305 1.984A1.75 1.75 0 0114.084 19H5.915a1.75 1.75 0 01-1.73-2.016L4.492 15H4.25A2.25 2.25 0 012 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.75-.107 1.126-.153V2.75zM6.5 4.25v2.09a41.38 41.38 0 017 0V4.25a.25.25 0 00-.25-.25h-6.5a.25.25 0 00-.25.25zM5.14 8.572a39.895 39.895 0 019.72 0l.328 2.132A39.903 39.903 0 0110 10.5a39.903 39.903 0 01-5.188-.796L5.14 8.572zm.912 8.678a.25.25 0 01-.247-.292L6.816 12.5h6.368l1.011 4.458a.25.25 0 01-.247.292H6.052z" clipRule="evenodd" />
            </svg>
            Print
          </a>
        </div>

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
