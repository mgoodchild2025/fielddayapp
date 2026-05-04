import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { PastGamesToggle } from '@/components/schedule/past-games-toggle'
import { formatGameTime } from '@/lib/format-time'
import Link from 'next/link'

export default async function SchedulePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 60-day lookback for past games/sessions
  const pastBound = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date().toISOString()

  const [
    { data: branding },
    { data: allGames },
    { data: myTeams },
  ] = await Promise.all([
    supabase.from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    supabase.from('games').select(`
      id, scheduled_at, court, week_number, status,
      home_team:teams!games_home_team_id_fkey(id, name, color),
      away_team:teams!games_away_team_id_fkey(id, name, color),
      league:leagues!games_league_id_fkey(name, slug)
    `)
      .eq('organization_id', org.id)
      .gte('scheduled_at', pastBound)
      .order('scheduled_at', { ascending: true }),
    supabase.from('team_members').select(`
      id, role,
      team:teams!team_members_team_id_fkey(id, name)
    `).eq('organization_id', org.id).eq('user_id', user.id).eq('status', 'active'),
  ])

  const timezone = branding?.timezone ?? 'America/Toronto'

  // Pickup sessions the player registered for (past 60 days + future)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mySessionRegs } = await (supabase as any)
    .from('session_registrations')
    .select(`
      id, session_id, status,
      session:event_sessions!session_registrations_session_id_fkey(
        id, scheduled_at, duration_minutes, location_override,
        league:leagues!event_sessions_league_id_fkey(id, name, slug)
      )
    `)
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'registered')

  // ── Derived sets ──────────────────────────────────────────────────────────
  const myTeamIds = new Set(
    (myTeams ?? []).map((mt) => {
      const team = Array.isArray(mt.team) ? mt.team[0] : mt.team
      return team?.id as string | undefined
    }).filter(Boolean) as string[]
  )

  // Games involving the player's teams (or all org games if no team memberships)
  const relevantGames = (allGames ?? []).filter((g) => {
    if (myTeamIds.size === 0) return true
    const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
    const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
    return myTeamIds.has(homeTeam?.id) || myTeamIds.has(awayTeam?.id)
  })

  // All registered pickup sessions from the lookback window onward
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSessions: any[] = (mySessionRegs ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((sr: any) => Array.isArray(sr.session) ? sr.session[0] : sr.session)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => s && s.scheduled_at >= pastBound)

  // ── Merge and split upcoming vs past ──────────────────────────────────────
  type GameItem    = { _type: 'game';    scheduled_at: string; data: typeof relevantGames[number] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type SessionItem = { _type: 'session'; scheduled_at: string; data: any }
  type ScheduleItem = GameItem | SessionItem

  const allItems: ScheduleItem[] = [
    ...relevantGames.map((g) => ({ _type: 'game' as const, scheduled_at: g.scheduled_at, data: g })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...allSessions.map((s: any) => ({ _type: 'session' as const, scheduled_at: s.scheduled_at, data: s })),
  ].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  const upcomingItems = allItems.filter((i) => i.scheduled_at >= nowIso)
  const pastItems     = allItems.filter((i) => i.scheduled_at <  nowIso).reverse() // most-recent-first

  // ── Card renderer ─────────────────────────────────────────────────────────
  function renderItem(item: ScheduleItem) {
    if (item._type === 'game') {
      const g = item.data
      const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
      const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
      const league   = Array.isArray(g.league)    ? g.league[0]    : g.league
      const { date: gameDate, time: gameTime } = formatGameTime(g.scheduled_at, timezone)
      const homeColor    = (homeTeam as { color?: string | null } | null)?.color
      const awayColor    = (awayTeam as { color?: string | null } | null)?.color
      const isHomeMyTeam = myTeamIds.has(homeTeam?.id)
      const isAwayMyTeam = myTeamIds.has(awayTeam?.id)
      const isCancelled  = g.status === 'cancelled' || g.status === 'postponed'

      return (
        <div
          key={`game-${g.id}`}
          className={`relative border rounded-md p-3 transition-shadow hover:shadow-md bg-white${isCancelled ? ' opacity-60' : ''}`}
        >
          {(league as { slug?: string } | null)?.slug && (
            <Link
              href={`/events/${(league as { slug?: string }).slug}`}
              className="absolute inset-0 rounded-md"
              aria-label={`View ${(league as { name?: string }).name ?? 'event'}`}
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
            <span className={isHomeMyTeam ? 'font-semibold' : 'font-medium'}>
              {homeTeam?.name ?? 'TBD'}
            </span>
            <span className="text-gray-400 text-sm mx-0.5">vs</span>
            {awayColor && (
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: awayColor }} />
            )}
            <span className={isAwayMyTeam ? 'font-semibold' : 'font-medium'}>
              {awayTeam?.name ?? 'TBD'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{(league as { name?: string } | null)?.name}</p>
        </div>
      )
    }

    // Pickup session
    const s      = item.data
    const league = Array.isArray(s.league) ? s.league[0] : s.league
    const { date: sessionDate, time: sessionTime } = formatGameTime(s.scheduled_at, timezone)
    const location = s.location_override as string | null
    return (
      <div key={`session-${s.id}`} className="relative border rounded-md p-3 transition-shadow hover:shadow-md bg-white">
        {(league as { slug?: string } | null)?.slug && (
          <Link
            href={`/events/${(league as { slug?: string }).slug}`}
            className="absolute inset-0 rounded-md"
            aria-label={`View ${(league as { name?: string }).name ?? 'event'}`}
          />
        )}
        <p className="text-sm text-gray-500">
          {sessionDate} · {sessionTime}
          {location ? ` · ${location}` : ''}
        </p>
        <p className="font-medium mt-0.5">Pickup Session</p>
        <p className="text-xs text-gray-400">{(league as { name?: string } | null)?.name}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          My Schedule
        </h1>

        {/* Upcoming */}
        <div className="space-y-2">
          {upcomingItems.length > 0
            ? upcomingItems.map(renderItem)
            : (
              <div className="border rounded-md p-6 text-center text-sm text-gray-400 bg-white">
                No games on the calendar — check back when your league publishes the schedule.
              </div>
            )
          }
        </div>

        {/* Past games — collapsed by default */}
        {pastItems.length > 0 && (
          <PastGamesToggle count={pastItems.length}>
            {pastItems.map(renderItem)}
          </PastGamesToggle>
        )}

      </div>
      <Footer org={org} />
    </div>
  )
}
