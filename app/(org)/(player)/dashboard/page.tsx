import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import { sortStandings, isVolleyballSport, computePts, accumulateGameResult, emptyTeamStat, type TeamStatTotals, type PtsMethod, type VolleyballMode } from '@/lib/standings'
import { fetchPlayerPlayoffGameRows } from '@/lib/playoff-games'
import { getPlayerMedals } from '@/lib/medal-queries'
import { getPlayerCareer } from '@/lib/career'
import type { BioCardData } from '@/components/bios/player-bio-card'
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
    db.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),

    db.from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    // Active team memberships

    db.from('team_members').select(`
      id, role,
      team:teams!team_members_team_id_fkey(
        id, name, color, logo_url,
        league:leagues!teams_league_id_fkey(id, name, slug, status, sport, standings_pts_method, volleyball_standings_mode)
      )
    `)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('status', 'active'),

    // Session path 1: explicit session registrations

    db.from('session_registrations').select(`
      id, session_id, status,
      session:event_sessions!session_registrations_session_id_fkey(
        id, scheduled_at, duration_minutes, location_override,
        league:leagues!event_sessions_league_id_fkey(id, name, slug, event_type, sport, logo_url)
      )
    `)
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'registered'),

    // Session path 2: drop-in registrations with a session_id

    db.from('registrations').select(`
      id, session_id,
      session:event_sessions!registrations_session_id_fkey(
        id, scheduled_at, duration_minutes, location_override,
        league:leagues!event_sessions_league_id_fkey(id, name, slug, event_type, sport, logo_url)
      )
    `)
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .not('session_id', 'is', null)
      .in('status', ['active', 'pending']),

    // Session path 3: season-pass registrations (league-level, not session-level)

    db.from('registrations').select('league_id')
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

    const { data } = await db.from('event_sessions').select(`
      id, scheduled_at, duration_minutes, location_override,
      league:leagues!event_sessions_league_id_fkey(id, name, slug, event_type, sport, logo_url)
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

  // ── Identity: trophy case + card — rendered in BOTH paths. A player with
  // nothing scheduled still has a career; the off-season dashboard keeps it.
  const myMedals = await getPlayerMedals(db, org.id, user.id)
  const [{ data: myBioRow }, myCareer] = await Promise.all([
    db.from('player_bios')
      .select('hero_photo_url, jersey_number, position, hometown, years_playing, tagline, hidden_by_admin')
      .eq('organization_id', org.id).eq('user_id', user.id).maybeSingle(),
    getPlayerCareer(db, org.id, user.id),
  ])
  const shelfCounts = myMedals.reduce(
    (acc, m) => { acc[m.placement] = (acc[m.placement] ?? 0) + 1; return acc },
    {} as Record<string, number>
  )
  const myShelf = (['gold', 'silver', 'bronze', 'tier_champion'] as const)
    .map((k) => ({ k, n: shelfCounts[k] ?? 0 }))
    .filter(({ n }) => n > 0)
    .map(({ k, n }) => ({ gold: '🥇', silver: '🥈', bronze: '🥉', tier_champion: '🏆' }[k].repeat(Math.min(n, 3)) + (n > 3 ? `×${n}` : '')))
    .join(' ') || null
  const myCardBio: BioCardData = {
    name: profileRow?.full_name ?? 'Player',
    photoUrl: myBioRow?.hero_photo_url ?? (profileRow as { avatar_url?: string | null } | null)?.avatar_url ?? null,
    position: myBioRow?.position ?? null,
    jerseyNumber: myBioRow?.jersey_number ?? null,
    hometown: myBioRow?.hometown ?? null,
    yearsPlaying: myBioRow?.years_playing ?? null,
    tagline: myBioRow?.tagline ?? null,
    medalShelf: myShelf,
  }

  // ── If no active teams and no sessions, render the off-season dashboard ───
  if (activeTeams.length === 0 && upcomingSessions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <DashboardClient
          firstName={firstName}
          medals={myMedals}
          myCardBio={myCardBio}
          myCareer={myCareer}
          myCardHref={`/players/${user.id}/card`}
          timezone={timezone}
          nextItem={null}
          sameDayGames={[]}
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
  let orgHasActiveWaiver = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pendingOfflinePayments: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pendingTeamPayments: any[] = []
  const managerTeamIds = activeTeams
    .filter((m) => m.role === 'captain' || m.role === 'coach')
    .map((m) => m.team.id as string)

  if (activeTeams.length > 0) {
    const [
      { data: ug },
      { data: rg },
      { data: alr },
      { data: lt },
      { data: mrr },
      { data: pr },
      { data: ws },
      { data: aw },
      { data: pp },
      { data: tpp },
    ] = await Promise.all([
      // Upcoming scheduled games for any of user's teams

      db.from('games').select(`
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

      db.from('games').select(`
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
      // pool_id included so we can exclude pool games from regular-season standings
      // sets + forfeit fields included so accumulateGameResult can mirror the standings tab

      db.from('games').select(`
        id, home_team_id, away_team_id, league_id, status, pool_id,
        game_results(home_score, away_score, status, sets, is_forfeit, forfeit_team_id)
      `)
        .eq('organization_id', org.id)
        .in('league_id', leagueIds),

      // Active teams in these leagues (for standings + denominator)
      // status='active' matches the standings page filter — inactive/dropped teams are excluded
      leagueIds.length > 0
        ? db.from('teams').select('id, league_id').in('league_id', leagueIds).eq('status', 'active')
        : Promise.resolve({ data: [] }),

      // User's own RSVPs for upcoming games

      db.from('game_rsvps').select('game_id, status')
        .eq('user_id', user.id)
        .eq('organization_id', org.id),

      // Pending registrations for active leagues (action needed)

      db.from('registrations').select(`
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

      // Check whether org has an active waiver configured
      db.from('waivers').select('id')
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),

      // Pending offline payments (cash / etransfer / cheque) for this player

      db.from('payments').select(`
        id, payment_method, amount_cents, currency,
        league:leagues!payments_league_id_fkey(name, slug),
        registration:registrations!payments_registration_id_fkey(status)
      `)
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .in('payment_method', ['cash', 'etransfer', 'cheque']),

      // TEAM payments for teams this user manages. Team payment rows carry no
      // user_id (the team owes, not a person), so they can't come from the query
      // above — find them via the captain/coach memberships. Paid rows are
      // fetched too: a stale pending row must NOT banner once the team has paid
      // (the duplicate-row era left some behind).
      managerTeamIds.length > 0
        ? db.from('payments').select(`
            id, team_id, league_id, status, payment_method, amount_cents, currency,
            league:leagues!payments_league_id_fkey(name, slug)
          `)
            .eq('organization_id', org.id)
            .eq('payment_type', 'team')
            .in('team_id', managerTeamIds)
            .in('status', ['pending', 'paid', 'manual'])
        : Promise.resolve({ data: [] }),
    ])

    upcomingGames   = ug  ?? []
    recentGamesRaw  = rg  ?? []
    allLeagueResults = alr ?? []
    leagueTeams     = lt  ?? []

    // Merge the player's upcoming published playoff matches (read-only bracket
    // games) so they appear alongside regular games in Next / same-day.
    const playoffRows = await fetchPlayerPlayoffGameRows(db, org.id, leagueIds, teamIds)
    const upcomingPlayoff = playoffRows.filter((p) => p.status !== 'completed' && p.scheduled_at >= now)
    if (upcomingPlayoff.length > 0) {
      upcomingGames = [...upcomingGames, ...upcomingPlayoff].sort((a, b) =>
        a.scheduled_at < b.scheduled_at ? -1 : a.scheduled_at > b.scheduled_at ? 1 : 0,
      )
    }
    myRsvpRows      = mrr ?? []
    pendingRegs     = pr  ?? []
    waiverSig          = ws
    orgHasActiveWaiver = !!aw
    pendingOfflinePayments = pp ?? []
    pendingTeamPayments = tpp ?? []
  }

  // ── RSVP counts for the globally soonest game ─────────────────────────────

  const myRsvpMap = new Map<string, 'in' | 'out'>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of myRsvpRows as any[]) {
    myRsvpMap.set(r.game_id as string, r.status as 'in' | 'out')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstGame = upcomingGames[0] as any | null

  const firstGameRsvpCounts = { in: 0, out: 0 }

  if (firstGame) {
    const myTeamId = teamIdSet.has(firstGame.home_team_id) ? firstGame.home_team_id : firstGame.away_team_id

    const { data: firstGameRsvpRows } = await db
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
  // Build per-league active team set + standings config — mirrors standings page.
  // The rank/points must honor the event's standings_pts_method + volleyball
  // mode, so we compute via the shared lib/standings helpers.
  const activeTeamIdsByLeague = new Map<string, Set<string>>()
  const leagueConfig = new Map<string, { sport: string | null; mode: VolleyballMode; method: PtsMethod }>()
  for (const m of activeTeams) {
    const lid = m.league.id as string
    const sport = (m.league.sport ?? null) as string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mode = (((m.league as any).volleyball_standings_mode ?? 'match_based') as VolleyballMode)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const method = (((m.league as any).standings_pts_method ?? 'wins') as PtsMethod)
    leagueConfig.set(lid, { sport, mode, method })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of leagueTeams as any[]) {
    const lid = t.league_id as string
    if (!activeTeamIdsByLeague.has(lid)) activeTeamIdsByLeague.set(lid, new Set())
    activeTeamIdsByLeague.get(lid)!.add(t.id as string)
  }

  const leagueRecordMap = new Map<string, Map<string, TeamStatTotals>>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of allLeagueResults as any[]) {
    if (g.status !== 'completed') continue
    // Include pool-play games too so the dashboard reflects OVERALL standings
    // (regular + pool combined), matching the event's Overall Standings tab.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results as any
    if (!result || result.status !== 'confirmed') continue
    const lid = g.league_id as string
    if (!lid) continue
    const ht = g.home_team_id as string
    const at = g.away_team_id as string
    if (!ht || !at) continue
    // Skip games involving inactive/dropped teams
    const activeIds = activeTeamIdsByLeague.get(lid)
    if (!activeIds || !activeIds.has(ht) || !activeIds.has(at)) continue
    if (!leagueRecordMap.has(lid)) leagueRecordMap.set(lid, new Map())
    accumulateGameResult(leagueRecordMap.get(lid)!, {
      homeTeamId: ht, awayTeamId: at,
      homeScore: result.home_score, awayScore: result.away_score,
      sets: result.sets, isForfeit: result.is_forfeit, forfeitTeamId: result.forfeit_team_id,
    }, isVolleyballSport(leagueConfig.get(lid)?.sport ?? null))
  }

  const teamsPerLeague = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of leagueTeams as any[]) {
    const lid = t.league_id as string
    teamsPerLeague.set(lid, (teamsPerLeague.get(lid) ?? 0) + 1)
  }

  function getStanding(leagueId: string, teamId: string): number | null {
    const leagueMap = leagueRecordMap.get(leagueId)
    const cfg = leagueConfig.get(leagueId)
    if (!leagueMap || !cfg) return null
    // Rank via the shared helper so the order honors the event's configured
    // standings mode + PTS method, exactly like the standings tab.
    const sorted = sortStandings(
      [...leagueMap.entries()].map(([tid, rec]) => ({ id: tid, name: '', ...rec })),
      cfg.sport,
      cfg.mode,
      cfg.method,
    )
    const idx = sorted.findIndex((t) => t.id === teamId)
    return idx >= 0 ? idx + 1 : null
  }

  // ── Build next item (game or session, whichever is soonest) ──────────────
  // Build a NextGameItem from a raw game row (closures over team/RSVP context).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildGameItem(g: any, rsvpInCount: number, rsvpOutCount: number): NextGameItem {
    const isHome = teamIdSet.has(g.home_team_id)
    const myTeamId = isHome ? g.home_team_id : g.away_team_id
    const myTeamData = activeTeams.find((m) => m.team.id === myTeamId)
    const opponentRaw = isHome
      ? (Array.isArray(g.away_team) ? g.away_team[0] : g.away_team)
      : (Array.isArray(g.home_team) ? g.home_team[0] : g.home_team)
    const leagueInfo = Array.isArray(g.league) ? g.league[0] : g.league
    return {
      kind: 'game',
      teamId: myTeamId as string,
      teamName: (myTeamData?.team.name ?? '') as string,
      teamColor: (myTeamData?.team.color ?? null) as string | null,
      teamLogoUrl: (myTeamData?.team.logo_url ?? null) as string | null,
      id: g.id as string,
      scheduledAt: g.scheduled_at as string,
      court: (g.court ?? null) as string | null,
      weekNumber: (g.week_number ?? null) as number | null,
      opponentName: (opponentRaw?.name ?? 'TBD') as string,
      opponentColor: (opponentRaw?.color ?? null) as string | null,
      opponentLogoUrl: (opponentRaw?.logo_url ?? null) as string | null,
      isHome,
      leagueName: (leagueInfo?.name ?? '') as string,
      rsvpIn: rsvpInCount,
      rsvpOut: rsvpOutCount,
      myRsvp: myRsvpMap.get(g.id as string) ?? null,
      isPlayoff: !!g.isPlayoff,
      playoffLabel: g.isPlayoff ? [g.playoffTier, g.playoffRound].filter(Boolean).join(' · ') : null,
    }
  }

  const nextGameItem: NextGameItem | null = firstGame
    ? buildGameItem(firstGame, firstGameRsvpCounts.in, firstGameRsvpCounts.out)
    : null

  // ── Other games on the same calendar day (org tz) as the next game ────────
  let sameDayGames: NextGameItem[] = []
  if (firstGame) {
    const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso))
    const firstDay = dayKey(firstGame.scheduled_at)
    // upcomingGames is sorted ascending, so these are all later the same day.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sameDayRaw = (upcomingGames as any[]).filter((g) => g.id !== firstGame.id && dayKey(g.scheduled_at) === firstDay)
    if (sameDayRaw.length > 0) {
      const ids = sameDayRaw.map((g) => g.id as string)
      const myTeamByGame = new Map<string, string>()
      for (const g of sameDayRaw) myTeamByGame.set(g.id, teamIdSet.has(g.home_team_id) ? g.home_team_id : g.away_team_id)

      const { data: rrows } = await db.from('game_rsvps').select('game_id, team_id, status').in('game_id', ids)
      const counts = new Map<string, { in: number; out: number }>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (rrows ?? []) as any[]) {
        if (r.team_id !== myTeamByGame.get(r.game_id)) continue  // only the player's team
        const c = counts.get(r.game_id) ?? { in: 0, out: 0 }
        if (r.status === 'in') c.in++
        else if (r.status === 'out') c.out++
        counts.set(r.game_id, c)
      }
      sameDayGames = sameDayRaw.map((g) => {
        const c = counts.get(g.id) ?? { in: 0, out: 0 }
        return buildGameItem(g, c.in, c.out)
      })
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
      leagueLogoUrl: (s.league?.logo_url ?? null) as string | null,
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
    const myRec = leagueRec?.get(teamId) ?? emptyTeamStat()
    const standing = getStanding(leagueId, teamId)
    const totalTeams = teamsPerLeague.get(leagueId) ?? null
    const cfg = leagueConfig.get(leagueId)

    // Points box, adapted to the event's standings mode (mirrors team stats page):
    // volleyball set-based → Set Wins; match-based volleyball → configured PTS
    // method; other sports → classic 3-1-0 points.
    let pointsLabel = 'Points'
    let pointsValue = myRec.wins * 3 + myRec.ties
    let pointsHint = `${myRec.wins}W · ${myRec.ties}T · ${myRec.losses}L`
    if (cfg && isVolleyballSport(cfg.sport) && cfg.mode === 'set_based') {
      pointsLabel = 'Set Wins'
      pointsValue = myRec.setWins
      pointsHint = `${myRec.setLosses} set losses`
    } else if (cfg && isVolleyballSport(cfg.sport)) {
      const hints: Record<PtsMethod, string> = {
        wins: '1 per win',
        set_wins: 'sets won',
        set_differential: 'SW − SL',
        points_for: 'points scored',
      }
      pointsValue = computePts({ id: teamId, name: '', ...myRec }, cfg.method)
      pointsHint = hints[cfg.method]
    }

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
        played: myRec.matchesPlayed,
        points: pointsValue,
        pointsLabel,
        pointsHint,
        standing,
        totalTeams,
      },
      recentResults,
    }
  })

  // ── Pending actions ───────────────────────────────────────────────────────
  const pendingActions: PendingAction[] = []

  // Unsigned waiver — only show if the org has an active waiver AND the player hasn't signed it
  if (!waiverSig && orgHasActiveWaiver && activeTeams.length > 0) {
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

  // Pending offline payments (cash / etransfer / cheque)
  // Deduplicate by league slug so one banner per league, not per payment row.
  const seenPaymentSlugs = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const pmt of pendingOfflinePayments as any[]) {
    const league = Array.isArray(pmt.league) ? pmt.league[0] : pmt.league
    // Only a payment backed by a live registration is still owed. Withdrawn
    // registrations (Leave) and deleted ones (admin remove detaches the row,
    // leaving registration null) both mean nobody owes this any more.
    const pmtReg = Array.isArray(pmt.registration) ? pmt.registration[0] : pmt.registration
    if (!pmtReg || !['pending', 'active', 'waitlisted'].includes(pmtReg.status)) continue
    if (!league?.slug || seenPaymentSlugs.has(league.slug)) continue
    seenPaymentSlugs.add(league.slug)
    const methodLabel = pmt.payment_method === 'etransfer' ? 'e-transfer'
      : pmt.payment_method === 'cheque' ? 'cheque'
      : 'cash'
    const amountFormatted = pmt.amount_cents > 0
      ? ` ($${(pmt.amount_cents / 100).toFixed(0)} ${(pmt.currency ?? 'cad').toUpperCase()})`
      : ''
    pendingActions.push({
      type: 'pending_payment',
      label: 'Payment outstanding',
      sublabel: `Your ${methodLabel} payment${amountFormatted} for ${league.name} hasn't been received yet.`,
      href: `/events/${league.slug}`,
    })
  }

  // Pending team payments (captain/coach chose an offline method for the team
  // fee). A team with ANY paid row owes nothing — skip its pending leftovers.
  const paidTeamKeys = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pendingTeamPayments as any[])
      .filter((pmt) => pmt.status === 'paid' || pmt.status === 'manual')
      .map((pmt) => `${pmt.team_id}:${pmt.league_id}`)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const pmt of pendingTeamPayments as any[]) {
    if (pmt.status !== 'pending') continue
    if (!['cash', 'etransfer', 'cheque'].includes(pmt.payment_method)) continue
    if (paidTeamKeys.has(`${pmt.team_id}:${pmt.league_id}`)) continue
    const league = Array.isArray(pmt.league) ? pmt.league[0] : pmt.league
    if (!league?.slug || seenPaymentSlugs.has(league.slug)) continue
    seenPaymentSlugs.add(league.slug)
    const methodLabel = pmt.payment_method === 'etransfer' ? 'e-transfer'
      : pmt.payment_method === 'cheque' ? 'cheque'
      : 'cash'
    const amountFormatted = pmt.amount_cents > 0
      ? ` ($${(pmt.amount_cents / 100).toFixed(0)} ${(pmt.currency ?? 'cad').toUpperCase()})`
      : ''
    pendingActions.push({
      type: 'pending_payment',
      label: 'Team payment outstanding',
      sublabel: `Your team's ${methodLabel} payment${amountFormatted} for ${league.name} hasn't been received yet.`,
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
          medals={myMedals}
          myCardBio={myCardBio}
          myCareer={myCareer}
          myCardHref={`/players/${user.id}/card`}
          timezone={timezone}
          nextItem={nextItem}
          sameDayGames={sameDayGames}
          teams={dashboardTeams}
          pendingActions={pendingActions}
          logoUrl={logoUrl}
        />
      </div>
      <Footer org={org} />
    </div>
  )
}
