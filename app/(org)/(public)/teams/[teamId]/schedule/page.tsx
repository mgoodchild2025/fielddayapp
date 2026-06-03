import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { MyGamesClient } from '../../../schedule/_client'
import type { GameSub } from '@/actions/game-subs'

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

  // Parallel: branding, team info, viewer's team memberships, org admin check
  const [{ data: branding }, { data: team }, { data: myTeams }, { data: orgMember }] = await Promise.all([
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
      .select('team_id, role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('status', 'active'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_members')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!team) notFound()

  // Viewer's team memberships → drives RSVP/bolding (same semantics as My Games)
  const myTeamIds = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (myTeams ?? []).map((m: any) => m.team_id as string).filter(Boolean)
  )

  // Must be a member of this team or an org/league admin
  const isOrgAdmin = ['org_admin', 'league_admin'].includes(orgMember?.role ?? '')
  if (!myTeamIds.has(teamId) && !isOrgAdmin) notFound()

  const timezone = branding?.timezone ?? 'America/Toronto'
  const pastBound = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date().toISOString()

  // Fetch all games involving this team within the 60-day lookback window
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawGames } = await (db as any)
    .from('games')
    .select(`
      id, scheduled_at, court, week_number, status,
      home_team:teams!games_home_team_id_fkey(id, name, color, logo_url),
      away_team:teams!games_away_team_id_fkey(id, name, color, logo_url),
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

  // ── RSVP + captain attendance + game subs (mirrors /schedule page) ──────────
  let myRsvps: { gameId: string; status: 'in' | 'out' }[] = []
  let captainTeamIds: string[] = []
  let captainAttendance: { gameId: string; in: number; out: number; total: number }[] = []
  let mySubGameIds: string[] = []
  let captainGameSubs: { gameId: string; teamId: string; subs: GameSub[] }[] = []

  if (games.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gameIds = games.map((g: any) => g.id as string)

    const [{ data: captainships }, { data: rsvpData }, { data: mySubRows }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('team_members').select('team_id').eq('user_id', user.id).eq('role', 'captain').eq('status', 'active'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('game_rsvps').select('game_id, status').eq('user_id', user.id).in('game_id', gameIds),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('game_subs').select('game_id').eq('user_id', user.id).eq('organization_id', org.id).eq('status', 'confirmed').in('game_id', gameIds),
    ])

    captainTeamIds = (captainships ?? []).map((c: { team_id: string }) => c.team_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    myRsvps = (rsvpData ?? []).map((r: any) => ({ gameId: r.game_id, status: r.status as 'in' | 'out' }))
    mySubGameIds = (mySubRows ?? []).map((r: { game_id: string }) => r.game_id)

    if (captainTeamIds.length > 0) {
      const captainTeamIdSet = new Set(captainTeamIds)
      const [{ data: teamMemberRows }, { data: teamRsvpRows }, { data: captainSubRows }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from('team_members').select('team_id').in('team_id', captainTeamIds).eq('status', 'active'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from('game_rsvps').select('game_id, team_id, status').in('team_id', captainTeamIds).in('game_id', gameIds),
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

      const subsByGame = new Map<string, GameSub[]>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of (captainSubRows ?? []) as any[]) {
        const inviter = Array.isArray(row.inviter) ? row.inviter[0] : row.inviter
        const sub: GameSub = {
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
      for (const game of games as any[]) {
        const homeTeam = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
        const awayTeam = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
        const hId = homeTeam?.id ?? ''
        const aId = awayTeam?.id ?? ''
        const captainTeamId = captainTeamIdSet.has(hId) ? hId : captainTeamIdSet.has(aId) ? aId : null
        if (!captainTeamId) continue
        const total = teamSizeMap.get(captainTeamId) ?? 0
        const counts = rsvpByGame.get(game.id) ?? { in: 0, out: 0 }
        captainAttendance.push({ gameId: game.id, in: counts.in, out: counts.out, total })
        captainGameSubs.push({ gameId: game.id, teamId: captainTeamId, subs: subsByGame.get(game.id) ?? [] })
      }
    }
  }

  // ── Build items in the MyGamesClient shape ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allItems = (games as any[]).map((g) => ({ _type: 'game' as const, scheduled_at: g.scheduled_at as string, data: g }))
  const upcomingItems = allItems.filter((i) => i.scheduled_at >= nowIso)
  const pastItems     = allItems.filter((i) => i.scheduled_at <  nowIso).reverse()

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
