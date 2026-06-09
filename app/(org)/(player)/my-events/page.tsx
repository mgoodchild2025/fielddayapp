import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { MyEventsClient } from './_client'
import type { EventItem } from './_client'

export default async function MyEventsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const host = headersList.get('host') ?? ''
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'

  const [{ data: branding }, { data: registrations }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('registrations').select(`
      id, status, checkin_token, created_at, session_id, registration_type,
      league:leagues!registrations_league_id_fkey(
        id, name, slug, league_status:status, event_type, sport, logo_url, season_start_date, season_end_date, checkin_enabled
      )
    `)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),
  ])

  // Fetch session dates for any drop-in registrations that have a session_id
  const sessionIds = (registrations ?? [])
    .map((r: { session_id: string | null }) => r.session_id)
    .filter(Boolean) as string[]

  const sessionDateMap = new Map<string, string>()
  if (sessionIds.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sessionRows } = await (db as any)
        .from('event_sessions')
        .select('id, scheduled_at')
        .in('id', sessionIds)
      for (const s of (sessionRows ?? [])) {
        sessionDateMap.set(s.id, s.scheduled_at)
      }
    } catch { /* session_id column not yet applied */ }
  }

  // Fetch branding timezone for session date formatting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: brandingTz } = await (db as any)
    .from('org_branding').select('timezone').eq('organization_id', org.id).single()
  const timezone = brandingTz?.timezone ?? 'America/Toronto'

  // Fetch scheduled dates for the calendar view, split by event type.
  // league / tournament → games table (player's team games; fallback to all published games)
  // drop_in / pickup   → event_sessions table (all upcoming sessions for the league)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type LeagueMeta = { id: string; name: string; slug: string; event_type: string | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueMetas: LeagueMeta[] = [...new Map((registrations ?? []).map((r: any) => {
    const league = Array.isArray(r.league) ? r.league[0] : r.league
    return league ? [league.id, { id: league.id, name: league.name, slug: league.slug, event_type: league.event_type }] : null
  }).filter(Boolean) as [string, LeagueMeta][]).values()]

  const teamBasedLeagueIds = leagueMetas
    .filter(l => !l.event_type || ['league', 'tournament'].includes(l.event_type))
    .map(l => l.id)
  const sessionBasedLeagueIds = leagueMetas
    .filter(l => ['drop_in', 'pickup'].includes(l.event_type ?? ''))
    .map(l => l.id)

  // IDs of drop_in/pickup leagues where the player already has a specific session registration
  // (those are already shown via sessionScheduledAt — no need to show all sessions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaguesWithSpecificSession = new Set((registrations ?? []).map((r: any) => {
    const league = Array.isArray(r.league) ? r.league[0] : r.league
    return r.session_id && league ? league.id : null
  }).filter(Boolean) as string[])

  // Game dots: { leagueId, date (YYYY-MM-DD in org tz), label }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let gameDots: { leagueId: string; date: string; label: string; href: string }[] = []

  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }) // YYYY-MM-DD

  // ── 1. league / tournament → games table ──────────────────────────────────
  if (teamBasedLeagueIds.length > 0) {
    // Player's teams in these leagues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: myTeamRows } = await (db as any)
      .from('team_members')
      .select('team_id, team:teams!team_members_team_id_fkey(league_id)')
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'active') as { data: { team_id: string; team: { league_id: string } | { league_id: string }[] | null }[] | null }

    const teamIdsByLeague = new Map<string, string>()
    for (const row of (myTeamRows ?? [])) {
      const teamRow = Array.isArray(row.team) ? row.team[0] : row.team
      const lid = (teamRow as { league_id?: string } | null)?.league_id
      if (lid && teamBasedLeagueIds.includes(lid)) teamIdsByLeague.set(lid, row.team_id)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allLeagueGames } = await (db as any)
      .from('games')
      .select('league_id, scheduled_at, home_team_id, away_team_id, status, leagues:leagues!games_league_id_fkey(name, slug, schedule_published)')
      .eq('organization_id', org.id)
      .in('league_id', teamBasedLeagueIds)
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true })

    for (const g of (allLeagueGames ?? []) as {
      league_id: string; scheduled_at: string; home_team_id: string | null;
      away_team_id: string | null; status: string;
      leagues: { name: string; slug: string; schedule_published: boolean } | null
    }[]) {
      const leagueRow = g.leagues
      if (!leagueRow) continue
      const myTeamId = teamIdsByLeague.get(g.league_id)
      const playerIsOnThisGame = myTeamId
        ? g.home_team_id === myTeamId || g.away_team_id === myTeamId
        : true // no team assigned yet — show all league games
      if (!playerIsOnThisGame) continue
      if (!myTeamId && leagueRow.schedule_published === false) continue
      gameDots.push({
        leagueId: g.league_id,
        date: fmt.format(new Date(g.scheduled_at)),
        label: leagueRow.name,
        href: `/events/${leagueRow.slug}`,
      })
    }
  }

  // ── 2. drop_in / pickup → event_sessions table ────────────────────────────
  // Only for leagues where the player doesn't already have a specific session registration
  const sessionLeaguesNeedingDots = sessionBasedLeagueIds.filter(id => !leaguesWithSpecificSession.has(id))
  if (sessionLeaguesNeedingDots.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessions } = await (db as any)
      .from('event_sessions')
      .select('league_id, scheduled_at, status')
      .eq('organization_id', org.id)
      .in('league_id', sessionLeaguesNeedingDots)
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true })

    const sessionLeagueMeta = new Map(leagueMetas.map(l => [l.id, l]))
    for (const s of (sessions ?? []) as { league_id: string; scheduled_at: string; status: string }[]) {
      const meta = sessionLeagueMeta.get(s.league_id)
      if (!meta) continue
      gameDots.push({
        leagueId: s.league_id,
        date: fmt.format(new Date(s.scheduled_at)),
        label: meta.name,
        href: `/events/${meta.slug}`,
      })
    }
  }

  // Deduplicate by leagueId+date (one dot per league per day)
  const seen = new Set<string>()
  gameDots = gameDots.filter(d => {
    const key = `${d.leagueId}:${d.date}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: EventItem[] = (registrations ?? []).map((r: any) => {
    const league = Array.isArray(r.league) ? r.league[0] : r.league
    const checkinUrl = r.checkin_token
      ? `${protocol}://${host}/checkin/${r.checkin_token}`
      : null
    const sessionScheduledAt = r.session_id ? sessionDateMap.get(r.session_id) ?? null : null
    return { registrationId: r.id, registrationStatus: r.status, checkinUrl, league, sessionScheduledAt, registrationType: r.registration_type }
  }).filter((r: EventItem) => r.league)

  const currentEvents = events.filter(e =>
    ['active', 'registration_open'].includes(e.league?.league_status ?? '')
  )
  const pastEvents = events.filter(e =>
    !['active', 'registration_open'].includes(e.league?.league_status ?? '')
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        <h1
          className="text-2xl font-bold uppercase mb-6"
          style={{ fontFamily: 'var(--brand-heading-font)' }}
        >
          My Events
        </h1>

        <MyEventsClient
          currentEvents={currentEvents}
          pastEvents={pastEvents}
          timezone={timezone}
          gameDots={gameDots}
        />
      </div>

      <Footer org={org} />
    </div>
  )
}
