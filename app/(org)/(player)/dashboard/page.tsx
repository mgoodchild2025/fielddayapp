import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import type {
  DashboardTeam,
  PendingAction,
  RecentResult,
  NextItem,
  NextGameItem,
  NextSessionItem,
} from '@/components/dashboard/dashboard-client'

export default async function DashboardPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date().toISOString()
  const pastBound = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
  // Sessions: look up to 14 days in the past (to include recent ones)
  const sessionPastBound = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  // ── Base queries (always run) ─────────────────────────────────────────────
  const [
    { data: profileRow },
    { data: branding },
    { data: memberships },
    { data: sessionRegRows },
    { data: dropInRegRows },
    { data: seasonPassRegs },
  ] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', user.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    // Active team memberships
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('team_members').select(`
      id, role,
      team:teams!team_members_team_id_fkey(
        id, name, color, logo_url,
        league:leagues!teams_league_id_fkey(id, name, slug, status, sport, standings_pts_method)
      )
    `)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('status', 'active'),

    // Session path 1: explicit session registrations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('session_registrations').select(`
      id, session_id, status,
      session:event_sessions!session_registrations_session_id_fkey(
        id, scheduled_at, duration_minutes, location_override,
        league:leagues!event_sessions_league_id_fkey(id, name, slug, event_type, sport)
      )
    `)
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'registered'),

    // Session path 2: drop-in registrations with a session_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('registrations').select(`
      id, session_id,
      session:event_sessions!registrations_session_id_fkey(
        id, scheduled_at, duration_minutes, location_override,
        league:leagues!event_sessions_league_id_fkey(id, name, slug, event_type, sport)
      )
    `)
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .not('session_id', 'is', null)
      .in('status', ['active', 'pending']),

    // Session path 3: season-pass registrations (league-level, not session-level)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('registrations').select('league_id')
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .is('session_id', null)
      .in('status', ['active', 'pending'])
      .or('registration_type.eq.season,registration_type.is.null'),
  ])

  const timezone = (branding as { timezone?: string } | null)?.timezone ?? 'America/Toronto'
  const firstName = profileRow?.full_name?.split(' ')[0] ?? 'there'
  const logoUrl = (branding as { logo_url?: string } | null)?.logo_url ?? null

  // ── Season-pass: fetch all sessions for those leagues ────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seasonLeagueIds = ((seasonPassRegs ?? []) as any[]).map((r) => r.league_id as string).filter(Boolean)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let seasonSessionRows: any[] = []
  if (seasonLeagueIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any).from('event_sessions').select(`
      id, scheduled_at, duration_minutes, location_override,
      league:leagues!event_sessions_league_id_fkey(id, name, slug, event_type, sport)
    `)
      .in('league_id', seasonLeagueIds)
      .eq('status', 'open')
      .gte('scheduled_at', sessionPastBound)
      .order('scheduled_at', { ascending: true })
      .limit(30)
    seasonSessionRows = data ?? []
  }

  // ── Collect + deduplicate all sessions ───────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractSession(row: any): any | null {
    const s = Array.isArray(row.session) ? row.session[0] : row.session
    if (!s?.scheduled_at) return null
    const league = Array.isArray(s.league) ? s.league[0] : s.league
    if (!league) return null
    return { ...s, league }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seenSessionIds = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcomingSessions: any[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((sessionRegRows ?? []) as any[]).map(extractSession),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((dropInRegRows ?? []) as any[]).map(extractSession),
    ...seasonSessionRows,
  ]
    .filter(Boolean)
    .filter((s) => s.scheduled_at > now)
    .filter((s) => {
      if (seenSessionIds.has(s.id)) return false
      seenSessionIds.add(s.id)
      return true
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  // ── Resolve active team memberships ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeTeams = ((memberships ?? []) as any[])
    .map((m) => {
      const team = Array.isArray(m.team) ? m.team[0] : m.team
      const league = team ? (Array.isArray(team.league) ? team.league[0] : team.league) : null
      return { membershipId: m.id, role: m.role as string, team, league }
    })
    .filter((m) => m.team && m.league && ['active', 'registration_open'].includes(m.league.status ?? ''))

  // ── If no active teams and no sessions, render minimal empty state ────────
  if (activeTeams.length === 0 && upcomingSessions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <DashboardClient
          firstName={firstName}
          timezone={timezone}
          nextItem={null}
          teams={[]}
          pendingActions={[]}
          logoUrl={logoUrl}
        />
        <Footer org={org} />
      </div>
    )
  }

  // ── Game queries (only if user has active teams) ──────────────────────────
  const teamIds = activeTeams.map((m) => m.team.id as string)
  const leagueIds = [...new Set(activeTeams.map((m) => m.league.id as string))]
  const teamIdList = teamIds.join(',')
  const teamIdSet = new Set(teamIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let upcomingGames: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recentGamesRaw: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allLeagueResults: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leagueTeams: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let myRsvpRows: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pendingRegs: any[] = []
  let waiverSig: { id: string } | null = null

  if (activeTeams.length > 0) {
    const [
      { data: ug },
      { data: rg },
      { data: alr },
      { data: lt },
      { data: mrr },
      { data: pr },
      { data: ws },
    ] = await Promise.all([
      // Upcoming scheduled games for any of user's teams
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('games').select(`
        id, scheduled_at, court, week_number, status, home_team_id, away_team_id, league_id,
        home_team:teams!games_home_team_id_fkey(id, name, color, logo_url),
        away_team:teams!games_away_team_id_fkey(id, name, color, logo_url),
        league:leagues!games_league_id_fkey(name, slug)
      `)
        .eq('organization_id', org.id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', now)
        .or(`home_team_id.in.(${teamIdList}),away_team_id.in.(${teamIdList})`)
        .order('scheduled_at', { ascending: true })
        .limit(30),

      // Recent past games with scores
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('games').select(`
        id, scheduled_at, home_team_id, away_team_id,
        home_team:teams!games_home_team_id_fkey(id, name),
        away_team:teams!games_away_team_id_fkey(id, name),
        game_results(home_score, away_score, status)
      `)
        .eq('organization_id', org.id)
        .gte('scheduled_at', pastBound)
        .lt('scheduled_at', now)
        .or(`home_team_id.in.(${teamIdList}),away_team_id.in.(${teamIdList})`)
        .order('scheduled_at', { ascending: false })
        .limit(20),

      // All confirmed results in these leagues (for standings computation)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('games').select(`
        id, home_team_id, away_team_id, league_id, status,
        game_results(home_score, away_score, status)
      `)
        .eq('organization_id', org.id)
        .in('league_id', leagueIds),

      // All teams in these leagues (for standings denominator)
      leagueIds.length > 0
        ? db.from('teams').select('id, league_id').in('league_id', leagueIds)
        : Promise.resolve({ data: [] }),

      // User's own RSVPs for upcoming games
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('game_rsvps').select('game_id, status')
        .eq('user_id', user.id)
        .eq('organization_id', org.id),

      // Pending registrations for active leagues (action needed)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('registrations').select(`
        id, status,
        league:leagues!registrations_league_id_fkey(name, slug)
      `)
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .in('league_id', leagueIds),

      // Org-level waiver signature
      db.from('waiver_signatures').select('id')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle(),
    ])

    upcomingGames   = ug  ?? []
    recentGamesRaw  = rg  ?? []
    allLeagueResults = alr ?? []
    leagueTeams     = lt  ?? []
    myRsvpRows      = mrr ?? []
    pendingRegs     = pr  ?? []
    waiverSig       = ws
  }

  // ── RSVP counts for the globally soonest game ─────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myRsvpMap = new Map<string, 'in' | 'out'>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of myRsvpRows as any[]) {
    myRsvpMap.set(r.game_id as string, r.status as 'in' | 'out')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstGame = upcomingGames[0] as any | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let firstGameRsvpCounts = { in: 0, out: 0 }

  if (firstGame) {
    const myTeamId = teamIdSet.has(firstGame.home_team_id) ? firstGame.home_team_id : firstGame.away_team_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: firstGameRsvpRows } = await (db as any)
      .from('game_rsvps')
      .select('team_id, status')
      .eq('game_id', firstGame.id)
      .eq('team_id', myTeamId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (firstGameRsvpRows ?? []) as any[]) {
      if (r.status === 'in') firstGameRsvpCounts.in++
      else if (r.status === 'out') firstGameRsvpCounts.out++
    }
  }

  // ── Standings computation ─────────────────────────────────────────────────
  const leagueRecordMap = new Map<string, Map<string, { wins: number; losses: number; ties: number; played: number }>>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of allLeagueResults as any[]) {
    if (g.status !== 'completed') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results as any
    if (!result || result.status !== 'confirmed') continue
    const lid = g.league_id as string
    if (!leagueRecordMap.has(lid)) leagueRecordMap.set(lid, new Map())
    const leagueMap = leagueRecordMap.get(lid)!
    const ht = g.home_team_id as string
    const at = g.away_team_id as string
    if (!leagueMap.has(ht)) leagueMap.set(ht, { wins: 0, losses: 0, ties: 0, played: 0 })
    if (!leagueMap.has(at)) leagueMap.set(at, { wins: 0, losses: 0, ties: 0, played: 0 })
    const home = leagueMap.get(ht)!
    const away = leagueMap.get(at)!
    home.played++; away.played++
    if (result.home_score > result.away_score) { home.wins++; away.losses++ }
    else if (result.away_score > result.home_score) { away.wins++; home.losses++ }
    else { home.ties++; away.ties++ }
  }

  const teamsPerLeague = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of leagueTeams as any[]) {
    const lid = t.league_id as string
    teamsPerLeague.set(lid, (teamsPerLeague.get(lid) ?? 0) + 1)
  }

  function getPoints(r: { wins: number; losses: number; ties: number }): number {
    return r.wins * 3 + r.ties
  }

  function getStanding(leagueId: string, teamId: string): number | null {
    const leagueMap = leagueRecordMap.get(leagueId)
    if (!leagueMap) return null
    const entries = [...leagueMap.entries()]
      .map(([tid, rec]) => ({ tid, points: getPoints(rec) }))
      .sort((a, b) => b.points - a.points)
    const idx = entries.findIndex((e) => e.tid === teamId)
    return idx >= 0 ? idx + 1 : null
  }

  // ── Build next item (game or session, whichever is soonest) ──────────────
  let nextGameItem: NextGameItem | null = null
  if (firstGame) {
    const isHome = teamIdSet.has(firstGame.home_team_id)
    const myTeamId = isHome ? firstGame.home_team_id : firstGame.away_team_id
    const myTeamData = activeTeams.find((m) => m.team.id === myTeamId)
    const opponentRaw = isHome
      ? (Array.isArray(firstGame.away_team) ? firstGame.away_team[0] : firstGame.away_team)
      : (Array.isArray(firstGame.home_team) ? firstGame.home_team[0] : firstGame.home_team)
    const leagueInfo = Array.isArray(firstGame.league) ? firstGame.league[0] : firstGame.league
    nextGameItem = {
      kind: 'game',
      teamId: myTeamId as string,
      teamName: (myTeamData?.team.name ?? '') as string,
      teamColor: (myTeamData?.team.color ?? null) as string | null,
      teamLogoUrl: (myTeamData?.team.logo_url ?? null) as string | null,
      id: firstGame.id as string,
      scheduledAt: firstGame.scheduled_at as string,
      court: (firstGame.court ?? null) as string | null,
      weekNumber: (firstGame.week_number ?? null) as number | null,
      opponentName: (opponentRaw?.name ?? 'TBD') as string,
      opponentColor: (opponentRaw?.color ?? null) as string | null,
      opponentLogoUrl: (opponentRaw?.logo_url ?? null) as string | null,
      isHome,
      leagueName: (leagueInfo?.name ?? '') as string,
      rsvpIn: firstGameRsvpCounts.in,
      rsvpOut: firstGameRsvpCounts.out,
      myRsvp: myRsvpMap.get(firstGame.id as string) ?? null,
    }
  }

  let nextSessionItem: NextSessionItem | null = null
  if (upcomingSessions.length > 0) {
    const s = upcomingSessions[0]
    nextSessionItem = {
      kind: 'session',
      id: s.id as string,
      scheduledAt: s.scheduled_at as string,
      leagueName: (s.league?.name ?? '') as string,
      leagueSlug: (s.league?.slug ?? '') as string,
      leagueSport: (s.league?.sport ?? null) as string | null,
      eventType: (s.league?.event_type ?? 'session') as string,
      duration: (s.duration_minutes ?? null) as number | null,
      location: (s.location_override ?? null) as string | null,
    }
  }

  // Pick the soonest between game and session
  let nextItem: NextItem = null
  if (nextGameItem && nextSessionItem) {
    nextItem = new Date(nextGameItem.scheduledAt) <= new Date(nextSessionItem.scheduledAt)
      ? nextGameItem
      : nextSessionItem
  } else {
    nextItem = nextGameItem ?? nextSessionItem
  }

  // ── Assemble per-team data (stats + recent results only) ──────────────────
  const dashboardTeams: DashboardTeam[] = activeTeams.map((m) => {
    const teamId = m.team.id as string
    const leagueId = m.league.id as string
    const leagueRec = leagueRecordMap.get(leagueId)
    const myRec = leagueRec?.get(teamId) ?? { wins: 0, losses: 0, ties: 0, played: 0 }
    const standing = getStanding(leagueId, teamId)
    const totalTeams = teamsPerLeague.get(leagueId) ?? null

    // Recent results (last 3 completed games for this team)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentResults: RecentResult[] = (recentGamesRaw as any[])
      .filter((g) => g.home_team_id === teamId || g.away_team_id === teamId)
      .slice(0, 3)
      .map((g) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results as any
        if (!result || result.status !== 'confirmed') return null
        const isHome = g.home_team_id === teamId
        const hs = result.home_score ?? 0
        const as_ = result.away_score ?? 0
        const myScore = isHome ? hs : as_
        const theirScore = isHome ? as_ : hs
        const outcome: 'W' | 'L' | 'T' = myScore > theirScore ? 'W' : myScore < theirScore ? 'L' : 'T'
        const opponentRaw = isHome
          ? (Array.isArray(g.away_team) ? g.away_team[0] : g.away_team)
          : (Array.isArray(g.home_team) ? g.home_team[0] : g.home_team)
        return {
          gameId: g.id as string,
          scheduledAt: g.scheduled_at as string,
          opponentName: (opponentRaw?.name ?? 'Unknown') as string,
          homeScore: hs,
          awayScore: as_,
          isHome,
          outcome,
        } satisfies RecentResult
      })
      .filter(Boolean) as RecentResult[]

    return {
      teamId,
      teamName: m.team.name as string,
      teamColor: (m.team.color ?? null) as string | null,
      teamLogoUrl: (m.team.logo_url ?? null) as string | null,
      role: m.role,
      leagueId,
      leagueName: m.league.name as string,
      leagueSlug: m.league.slug as string,
      leagueSport: (m.league.sport ?? null) as string | null,
      record: {
        wins: myRec.wins,
        losses: myRec.losses,
        ties: myRec.ties,
        played: myRec.played,
        points: getPoints(myRec),
        standing,
        totalTeams,
      },
      recentResults,
    }
  })

  // ── Pending actions ───────────────────────────────────────────────────────
  const pendingActions: PendingAction[] = []

  // Unsigned waiver (if they have active registrations but no waiver sig for this org)
  if (!waiverSig && activeTeams.length > 0) {
    const firstLeague = activeTeams[0].league
    if (firstLeague?.slug) {
      pendingActions.push({
        type: 'waiver',
        label: 'Waiver signature required',
        sublabel: `Sign the waiver to complete your registration for ${firstLeague.name}.`,
        href: `/events/${firstLeague.slug}/sign-waiver`,
      })
    }
  }

  // Pending (unpaid/incomplete) registrations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const reg of pendingRegs as any[]) {
    const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
    if (!league?.slug) continue
    pendingActions.push({
      type: 'pending_registration',
      label: 'Registration incomplete',
      sublabel: `Complete your registration for ${league.name}.`,
      href: `/events/${league.slug}`,
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={logoUrl} />
      <div className="flex-1">
        <DashboardClient
          firstName={firstName}
          timezone={timezone}
          nextItem={nextItem}
          teams={dashboardTeams}
          pendingActions={pendingActions}
          logoUrl={logoUrl}
        />
      </div>
      <Footer org={org} />
    </div>
  )
}
