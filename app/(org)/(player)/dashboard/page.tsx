import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import type { DashboardTeam, PendingAction, RecentResult } from '@/components/dashboard/dashboard-client'

export default async function DashboardPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date().toISOString()
  const pastBound = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()

  // ── Base queries (parallel) ───────────────────────────────────────────────
  const [{ data: profileRow }, { data: branding }, { data: memberships }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', user.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
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
  ])

  const timezone = (branding as { timezone?: string } | null)?.timezone ?? 'America/Toronto'
  const firstName = profileRow?.full_name?.split(' ')[0] ?? 'there'
  const logoUrl = (branding as { logo_url?: string } | null)?.logo_url ?? null

  // ── Resolve active teams ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeTeams = ((memberships ?? []) as any[])
    .map((m) => {
      const team = Array.isArray(m.team) ? m.team[0] : m.team
      const league = team ? (Array.isArray(team.league) ? team.league[0] : team.league) : null
      return { membershipId: m.id, role: m.role as string, team, league }
    })
    .filter((m) => m.team && m.league && ['active', 'registration_open'].includes(m.league.status ?? ''))

  if (activeTeams.length === 0) {
    // Return empty-state dashboard (no data to fetch)
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <DashboardClient
          firstName={firstName}
          timezone={timezone}
          teams={[]}
          pendingActions={[]}
          logoUrl={logoUrl}
        />
        <Footer org={org} />
      </div>
    )
  }

  const teamIds = activeTeams.map((m) => m.team.id as string)
  const leagueIds = [...new Set(activeTeams.map((m) => m.league.id as string))]
  const teamIdList = teamIds.join(',')

  // ── Game + standings queries (parallel) ───────────────────────────────────
  const [
    { data: upcomingGames },
    { data: recentGamesRaw },
    { data: allLeagueResults },
    { data: leagueTeams },
    { data: myRsvpRows },
    { data: pendingRegs },
    { data: waiverSig },
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

    // Org-level waiver signature (check if they've signed anything for this org)
    db.from('waiver_signatures').select('id')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle(),
  ])

  // ── RSVP counts for the next game per team ────────────────────────────────
  // Find the first upcoming game per team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextGamePerTeam = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of (upcomingGames ?? []) as any[]) {
    const homeId = g.home_team_id as string
    const awayId = g.away_team_id as string
    for (const teamId of teamIds) {
      if ((homeId === teamId || awayId === teamId) && !nextGamePerTeam.has(teamId)) {
        nextGamePerTeam.set(teamId, g)
      }
    }
  }

  // Fetch RSVP counts for those specific games
  const nextGameIds = [...new Set([...nextGamePerTeam.values()].map((g) => g.id as string))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allRsvpCounts: any[] = []
  if (nextGameIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rsvpCountRows } = await (db as any)
      .from('game_rsvps')
      .select('game_id, team_id, status')
      .in('game_id', nextGameIds)
    allRsvpCounts = rsvpCountRows ?? []
  }

  // ── Standings computation ─────────────────────────────────────────────────
  // Per league: count W/L/T for every team from confirmed results
  const leagueRecordMap = new Map<string, Map<string, { wins: number; losses: number; ties: number; played: number }>>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of (allLeagueResults ?? []) as any[]) {
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

  // Count teams per league
  const teamsPerLeague = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (leagueTeams ?? []) as any[]) {
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

  // ── Assemble per-team data ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myRsvpMap = new Map<string, 'in' | 'out'>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (myRsvpRows ?? []) as any[]) {
    myRsvpMap.set(r.game_id as string, r.status as 'in' | 'out')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rsvpByGameAndTeam = new Map<string, { in: number; out: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of allRsvpCounts as any[]) {
    const key = `${r.game_id}:${r.team_id}`
    if (!rsvpByGameAndTeam.has(key)) rsvpByGameAndTeam.set(key, { in: 0, out: 0 })
    const e = rsvpByGameAndTeam.get(key)!
    if (r.status === 'in') e.in++
    else if (r.status === 'out') e.out++
  }

  const dashboardTeams: DashboardTeam[] = activeTeams.map((m) => {
    const teamId = m.team.id as string
    const leagueId = m.league.id as string
    const leagueRec = leagueRecordMap.get(leagueId)
    const myRec = leagueRec?.get(teamId) ?? { wins: 0, losses: 0, ties: 0, played: 0 }
    const standing = getStanding(leagueId, teamId)
    const totalTeams = teamsPerLeague.get(leagueId) ?? null

    // Next game for this team
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ng = nextGamePerTeam.get(teamId) as any | undefined
    let nextGame: DashboardTeam['nextGame'] = null
    if (ng) {
      const isHome = ng.home_team_id === teamId
      const opponentTeamRaw = isHome
        ? (Array.isArray(ng.away_team) ? ng.away_team[0] : ng.away_team)
        : (Array.isArray(ng.home_team) ? ng.home_team[0] : ng.home_team)
      const leagueInfo = Array.isArray(ng.league) ? ng.league[0] : ng.league
      const rsvpKey = `${ng.id}:${teamId}`
      const rsvpCount = rsvpByGameAndTeam.get(rsvpKey) ?? { in: 0, out: 0 }
      // Get total team member count for noResponse (approximate — team size minus responded)
      const totalResponded = rsvpCount.in + rsvpCount.out
      nextGame = {
        id: ng.id as string,
        scheduledAt: ng.scheduled_at as string,
        court: (ng.court ?? null) as string | null,
        weekNumber: (ng.week_number ?? null) as number | null,
        opponentName: opponentTeamRaw?.name ?? 'TBD',
        opponentColor: opponentTeamRaw?.color ?? null,
        opponentLogoUrl: opponentTeamRaw?.logo_url ?? null,
        isHome,
        leagueName: leagueInfo?.name ?? m.league.name,
        rsvpIn: rsvpCount.in,
        rsvpOut: rsvpCount.out,
        rsvpNoResponse: Math.max(0, (myRec.played > 0 ? 0 : 0) - totalResponded), // best effort — can't know team size without extra query
        myRsvp: myRsvpMap.get(ng.id as string) ?? null,
      }
    }

    // Recent results (last 3 completed games for this team)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentResults: RecentResult[] = ((recentGamesRaw ?? []) as any[])
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
          opponentName: opponentRaw?.name ?? 'Unknown',
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
      nextGame,
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

  // Sort: teams with a next game first
  dashboardTeams.sort((a, b) => {
    if (a.nextGame && !b.nextGame) return -1
    if (!a.nextGame && b.nextGame) return 1
    if (a.nextGame && b.nextGame) {
      return new Date(a.nextGame.scheduledAt).getTime() - new Date(b.nextGame.scheduledAt).getTime()
    }
    return 0
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
  for (const reg of (pendingRegs ?? []) as any[]) {
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
          teams={dashboardTeams}
          pendingActions={pendingActions}
          logoUrl={logoUrl}
        />
      </div>
      <Footer org={org} />
    </div>
  )
}
