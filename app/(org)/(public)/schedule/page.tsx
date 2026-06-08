import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { MyGamesClient } from './_client'
import Link from 'next/link'

export default async function SchedulePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('games').select(`
      id, scheduled_at, court, week_number, status,
      home_team:teams!games_home_team_id_fkey(id, name, color, logo_url),
      away_team:teams!games_away_team_id_fkey(id, name, color, logo_url),
      league:leagues!games_league_id_fkey(name, slug, schedule_published, event_type)
    `)
      .eq('organization_id', org.id)
      .gte('scheduled_at', pastBound)
      .order('scheduled_at', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('team_members').select(`
      id, role,
      team:teams!team_members_team_id_fkey(id, name)
    `).eq('organization_id', org.id).eq('user_id', user.id).eq('status', 'active'),
  ])

  const timezone = branding?.timezone ?? 'America/Toronto'

  // Filter out games from leagues with unpublished schedules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publishedGames = (allGames ?? []).filter((g: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const league = Array.isArray(g.league) ? g.league[0] : g.league
    return league?.schedule_published !== false
  })

  // Sessions the player should see — three paths:
  // 1. session_registrations rows (explicit per-session pickup signup)
  // 2. registrations.session_id (drop-in registered through normal event flow)
  // 3. All sessions for leagues where they hold a season-pass registration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: mySessionRegs }, { data: myRegWithSession }, { data: mySeasonRegs }] = await Promise.all([
    (db as any)
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
      .eq('status', 'registered'),
    // Drop-in registrations with a specific session_id
    (db as any)
      .from('registrations')
      .select(`
        id, session_id,
        session:event_sessions!registrations_session_id_fkey(
          id, scheduled_at, duration_minutes, location_override,
          league:leagues!event_sessions_league_id_fkey(id, name, slug)
        )
      `)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .not('session_id', 'is', null)
      .in('status', ['active', 'pending']),
    // Season-pass registrations — player attends all sessions for the league
    (db as any)
      .from('registrations')
      .select('league_id')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .is('session_id', null)
      .in('status', ['active', 'pending'])
      .or('registration_type.eq.season,registration_type.is.null'),
  ])

  // ── Derived sets ──────────────────────────────────────────────────────────
  const myTeamIds = new Set(
    (myTeams ?? []).map((mt) => {
      const team = Array.isArray(mt.team) ? mt.team[0] : mt.team
      return team?.id as string | undefined
    }).filter(Boolean) as string[]
  )

  // Only show games where the player is on one of the teams
  const relevantGames = myTeamIds.size === 0 ? [] : publishedGames.filter((g) => {
    const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
    const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
    return myTeamIds.has(homeTeam?.id) || myTeamIds.has(awayTeam?.id)
  })

  // Fetch all sessions for season-pass leagues (player attends every session)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seasonLeagueIds = (mySeasonRegs ?? []).map((r: any) => r.league_id).filter(Boolean) as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let seasonSessions: any[] = []
  if (seasonLeagueIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (db as any)
      .from('event_sessions')
      .select(`
        id, scheduled_at, duration_minutes, location_override,
        league:leagues!event_sessions_league_id_fkey(id, name, slug)
      `)
      .in('league_id', seasonLeagueIds)
      .eq('organization_id', org.id)
      .eq('status', 'open')
      .gte('scheduled_at', pastBound)
      .order('scheduled_at', { ascending: true })
    seasonSessions = rows ?? []
  }

  // Merge sessions from all three sources, deduplicate by session id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seenSessionIds = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSessions: any[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(mySessionRegs ?? []).map((sr: any) => Array.isArray(sr.session) ? sr.session[0] : sr.session),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(myRegWithSession ?? []).map((r: any) => Array.isArray(r.session) ? r.session[0] : r.session),
    ...seasonSessions,
  ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => {
      if (!s || s.scheduled_at < pastBound) return false
      if (seenSessionIds.has(s.id)) return false
      seenSessionIds.add(s.id)
      return true
    })

  // ── RSVP + captain attendance ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let myRsvps: { gameId: string; status: 'in' | 'out' }[] = []
  let captainTeamIds: string[] = []
  let captainAttendance: { gameId: string; in: number; out: number; total: number }[] = []
  // Game subs: which games this user is subbing in, and subs per game for captains
  let mySubGameIds: string[] = []
  let captainGameSubs: { gameId: string; teamId: string; subs: import('@/actions/game-subs').GameSub[] }[] = []

  if (relevantGames.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gameIds = relevantGames.map((g: any) => g.id as string)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: captainships }, { data: rsvpData }, { data: mySubRows }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('team_members').select('team_id').eq('user_id', user.id).eq('role', 'captain').eq('status', 'active'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('game_rsvps').select('game_id, status').eq('user_id', user.id).in('game_id', gameIds),
      // Confirmed game_subs for this user (to show "Sub" badge on game cards)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('game_subs').select('game_id').eq('user_id', user.id).eq('organization_id', org.id).eq('status', 'confirmed').in('game_id', gameIds),
    ])

    captainTeamIds = (captainships ?? []).map((c: { team_id: string }) => c.team_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    myRsvps = (rsvpData ?? []).map((r: any) => ({ gameId: r.game_id, status: r.status as 'in' | 'out' }))
    mySubGameIds = (mySubRows ?? []).map((r: { game_id: string }) => r.game_id)

    if (captainTeamIds.length > 0) {
      const captainTeamIdSet = new Set(captainTeamIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [{ data: teamMemberRows }, { data: teamRsvpRows }, { data: captainSubRows }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from('team_members').select('team_id').in('team_id', captainTeamIds).eq('status', 'active'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from('game_rsvps').select('game_id, team_id, status').in('team_id', captainTeamIds).in('game_id', gameIds),
        // Game subs for captain's games (for invite panel)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from('game_subs').select(`
          id, game_id, team_id, user_id, invited_email, status, message, expires_at, created_at,
          inviter:profiles!game_subs_invited_by_fkey(full_name)
        `).in('team_id', captainTeamIds).in('game_id', gameIds).in('status', ['invited', 'confirmed']),
      ])

      const teamSizeMap = new Map<string, number>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of (teamMemberRows ?? []) as any[]) {
        teamSizeMap.set(row.team_id, (teamSizeMap.get(row.team_id) ?? 0) + 1)
      }

      const rsvpByGame = new Map<string, { in: number; out: number }>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (teamRsvpRows ?? []) as any[]) {
        if (!rsvpByGame.has(r.game_id)) rsvpByGame.set(r.game_id, { in: 0, out: 0 })
        const e = rsvpByGame.get(r.game_id)!
        if (r.status === 'in') e.in++
        else if (r.status === 'out') e.out++
      }

      // Group subs by game_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subsByGame = new Map<string, import('@/actions/game-subs').GameSub[]>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of (captainSubRows ?? []) as any[]) {
        const inviter = Array.isArray(row.inviter) ? row.inviter[0] : row.inviter
        const sub: import('@/actions/game-subs').GameSub = {
          id: row.id,
          gameId: row.game_id,
          teamId: row.team_id,
          userId: row.user_id ?? null,
          invitedEmail: row.invited_email,
          status: row.status,
          inviterName: inviter?.full_name ?? null,
          message: row.message ?? null,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        }
        if (!subsByGame.has(row.game_id)) subsByGame.set(row.game_id, [])
        subsByGame.get(row.game_id)!.push(sub)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const game of relevantGames as any[]) {
        const homeTeam = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
        const awayTeam = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
        const hId = homeTeam?.id ?? ''
        const aId = awayTeam?.id ?? ''
        const captainTeamId = captainTeamIdSet.has(hId) ? hId : captainTeamIdSet.has(aId) ? aId : null
        if (!captainTeamId) continue
        const total = teamSizeMap.get(captainTeamId) ?? 0
        const counts = rsvpByGame.get(game.id) ?? { in: 0, out: 0 }
        captainAttendance.push({ gameId: game.id, in: counts.in, out: counts.out, total })
        captainGameSubs.push({
          gameId: game.id,
          teamId: captainTeamId,
          subs: subsByGame.get(game.id) ?? [],
        })
      }
    }
  }

  // ── Merge and split upcoming vs past ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allItems: { _type: 'game' | 'session'; scheduled_at: string; data: any }[] = [
    ...relevantGames.map((g) => ({ _type: 'game' as const, scheduled_at: g.scheduled_at, data: g })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...allSessions.map((s: any) => ({ _type: 'session' as const, scheduled_at: s.scheduled_at, data: s })),
  ].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  const upcomingItems = allItems.filter((i) => i.scheduled_at >= nowIso)
  const pastItems     = allItems.filter((i) => i.scheduled_at <  nowIso).reverse() // most-recent-first

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 flex-1">

        <h1 className="text-2xl font-bold uppercase mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          My Games
        </h1>

        {/* No-team contextual banner */}
        {myTeamIds.size === 0 && allSessions.length === 0 && (
          <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-amber-800">
              <span className="font-semibold">You haven&apos;t joined a team yet.</span>{' '}
              <Link href="/events" className="underline hover:no-underline">Browse events</Link> to register and get your personal schedule here.
            </div>
          </div>
        )}

        <MyGamesClient
          upcomingItems={upcomingItems}
          pastItems={pastItems}
          myTeamIds={Array.from(myTeamIds)}
          captainTeamIds={captainTeamIds}
          myRsvps={myRsvps}
          captainAttendance={captainAttendance}
          mySubGameIds={mySubGameIds}
          captainGameSubs={captainGameSubs}
          userId={user.id}
          timezone={timezone}
        />

      </div>
      <Footer org={org} />
    </div>
  )
}
