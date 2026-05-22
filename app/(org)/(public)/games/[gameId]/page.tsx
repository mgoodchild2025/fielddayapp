import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { GameRsvpButton } from '@/components/schedule/game-rsvp-button'
import { GameAttendancePanel } from '@/components/schedule/game-attendance-panel'
import { formatGameTime } from '@/lib/format-time'

// ── Helpers ──────────────────────────────────────────────────────────────────

function TeamLogo({
  name,
  logoUrl,
  color,
  size = 'lg',
}: {
  name: string
  logoUrl?: string | null
  color?: string | null
  size?: 'md' | 'lg'
}) {
  const dim = size === 'lg' ? 'w-16 h-16' : 'w-12 h-12'
  const textSize = size === 'lg' ? 'text-xl' : 'text-base'
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={`${dim} rounded-full object-cover border border-gray-100 shadow-sm`}
      />
    )
  }

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center border border-gray-200 shadow-sm ${textSize} font-bold text-white`}
      style={{ backgroundColor: color ?? '#9ca3af' }}
    >
      {initials}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function GameMatchupPage({
  params,
}: {
  params: Promise<{ gameId: string }>
}) {
  const { gameId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Parallel fetch: branding, game, user's team memberships ──────────────
  const [{ data: branding }, { data: rawGame }, { data: myTeamRows }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('games')
      .select(`
        id, scheduled_at, court, week_number, status, league_id,
        home_team:teams!games_home_team_id_fkey(id, name, color, logo_url),
        away_team:teams!games_away_team_id_fkey(id, name, color, logo_url),
        league:leagues!games_league_id_fkey(id, name, slug, event_type, sport),
        game_results(home_score, away_score, sets, status)
      `)
      .eq('id', gameId)
      .eq('organization_id', org.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'active'),
  ])

  if (!rawGame) notFound()

  const timezone = branding?.timezone ?? 'America/Toronto'

  // Normalise Supabase array-or-object FK fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homeTeam = Array.isArray(rawGame.home_team) ? rawGame.home_team[0] : rawGame.home_team as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const awayTeam = Array.isArray(rawGame.away_team) ? rawGame.away_team[0] : rawGame.away_team as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const league   = Array.isArray(rawGame.league)    ? rawGame.league[0]    : rawGame.league as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result   = Array.isArray(rawGame.game_results) ? rawGame.game_results[0] : rawGame.game_results as any

  const homeTeamId = homeTeam?.id ?? null
  const awayTeamId = awayTeam?.id ?? null

  const { date: gameDate, time: gameTime } = formatGameTime(rawGame.scheduled_at, timezone)
  const isCancelled  = rawGame.status === 'cancelled'
  const isPostponed  = rawGame.status === 'postponed'
  const isCompleted  = result?.status === 'confirmed'
  const nowIso = new Date().toISOString()
  const isUpcoming = rawGame.scheduled_at >= nowIso

  // ── RSVP + attendance data (upcoming games only) ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myTeamIdSet = new Set((myTeamRows ?? []).map((r: any) => r.team_id as string))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myCaptainTeamIds = new Set((myTeamRows ?? []).filter((r: any) => r.role === 'captain').map((r: any) => r.team_id as string))

  const isHomeMyTeam = homeTeamId ? myTeamIdSet.has(homeTeamId) : false
  const isAwayMyTeam = awayTeamId ? myTeamIdSet.has(awayTeamId) : false
  const myTeamId = isHomeMyTeam ? homeTeamId : isAwayMyTeam ? awayTeamId : null

  const captainTeamIdForGame = homeTeamId && myCaptainTeamIds.has(homeTeamId)
    ? homeTeamId
    : awayTeamId && myCaptainTeamIds.has(awayTeamId)
      ? awayTeamId
      : null

  let rsvpStatus: 'in' | 'out' | null = null
  let attendanceCounts: { in: number; out: number; total: number } | null = null
  let captainGameSubsList: import('@/actions/game-subs').GameSub[] = []

  if (isUpcoming && (myTeamId || captainTeamIdForGame)) {
    const [{ data: rsvpData }, { data: captainships }, { data: subRows }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      myTeamId ? (db as any).from('game_rsvps').select('status').eq('game_id', gameId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      captainTeamIdForGame ? (db as any).from('team_members').select('team_id').in('team_id', [captainTeamIdForGame]).eq('status', 'active') : Promise.resolve({ data: null }),
      // Game subs for captain's attendance panel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      captainTeamIdForGame ? (db as any).from('game_subs').select(`
        id, game_id, team_id, user_id, invited_email, status, message, expires_at, created_at,
        inviter:profiles!game_subs_invited_by_fkey(full_name)
      `).eq('game_id', gameId).eq('team_id', captainTeamIdForGame).in('status', ['invited', 'confirmed']) : Promise.resolve({ data: null }),
    ])

    rsvpStatus = rsvpData?.status ?? null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    captainGameSubsList = (subRows ?? []).map((row: any) => {
      const inviter = Array.isArray(row.inviter) ? row.inviter[0] : row.inviter
      return {
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
    })

    if (captainTeamIdForGame && captainships) {
      const total = (captainships as { team_id: string }[]).length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: teamRsvps } = await (db as any)
        .from('game_rsvps')
        .select('status')
        .eq('game_id', gameId)
        .eq('team_id', captainTeamIdForGame)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inCount  = (teamRsvps ?? []).filter((r: any) => r.status === 'in').length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outCount = (teamRsvps ?? []).filter((r: any) => r.status === 'out').length
      attendanceCounts = { in: inCount, out: outCount, total }
    }
  }

  // ── Head-to-head data (same league, both teams must exist) ───────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let h2hGames: any[] = []
  if (homeTeamId && awayTeamId && rawGame.league_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: h2hRows } = await (db as any)
      .from('games')
      .select(`
        id, scheduled_at, court, status, week_number,
        home_team:teams!games_home_team_id_fkey(id, name),
        away_team:teams!games_away_team_id_fkey(id, name),
        game_results(home_score, away_score, status)
      `)
      .eq('league_id', rawGame.league_id)
      .eq('organization_id', org.id)
      .or(`and(home_team_id.eq.${homeTeamId},away_team_id.eq.${awayTeamId}),and(home_team_id.eq.${awayTeamId},away_team_id.eq.${homeTeamId})`)
      .order('scheduled_at', { ascending: false })
    h2hGames = h2hRows ?? []
  }

  // Compute W/L/D from homeTeam's perspective
  let homeWins = 0, awayWins = 0, draws = 0
  for (const g of h2hGames) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results as any
    if (!r || r.status !== 'confirmed') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gHome = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team as any
    const gameHomeIsOurHome = gHome?.id === homeTeamId
    const hs = r.home_score ?? 0
    const as_ = r.away_score ?? 0
    if (hs === as_) {
      draws++
    } else if (hs > as_) {
      if (gameHomeIsOurHome) homeWins++; else awayWins++
    } else {
      if (gameHomeIsOurHome) awayWins++; else homeWins++
    }
  }

  const hasH2hHistory = homeWins + awayWins + draws > 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 flex-1">

        {/* Back link */}
        <Link href="/schedule" className="text-sm text-gray-500 hover:underline">
          ← My Games
        </Link>

        {/* ── Hero card ── */}
        <div className="mt-4 bg-white border rounded-xl p-5 sm:p-6">

          {/* Team logos + VS */}
          <div className="flex items-center justify-between gap-4">
            {/* Home team */}
            <div className="flex flex-col items-center gap-2 flex-1 text-center">
              <TeamLogo
                name={homeTeam?.name ?? 'TBD'}
                logoUrl={homeTeam?.logo_url}
                color={homeTeam?.color}
              />
              <span className={`text-sm font-semibold leading-tight ${isHomeMyTeam ? '' : 'text-gray-700'}`}
                style={isHomeMyTeam ? { color: 'var(--brand-primary)' } : {}}>
                {homeTeam?.name ?? 'TBD'}
              </span>
            </div>

            {/* Score or VS */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              {isCompleted ? (
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold tabular-nums">{result.home_score}</span>
                  <span className="text-gray-300 text-2xl">–</span>
                  <span className="text-3xl font-bold tabular-nums">{result.away_score}</span>
                </div>
              ) : (
                <span className="text-xl font-medium text-gray-400">VS</span>
              )}
              {/* Status badge */}
              {isCancelled && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
                  Cancelled
                </span>
              )}
              {isPostponed && (
                <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                  Postponed
                </span>
              )}
              {isCompleted && (
                <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
                  Final
                </span>
              )}
            </div>

            {/* Away team */}
            <div className="flex flex-col items-center gap-2 flex-1 text-center">
              <TeamLogo
                name={awayTeam?.name ?? 'TBD'}
                logoUrl={awayTeam?.logo_url}
                color={awayTeam?.color}
              />
              <span className={`text-sm font-semibold leading-tight ${isAwayMyTeam ? '' : 'text-gray-700'}`}
                style={isAwayMyTeam ? { color: 'var(--brand-primary)' } : {}}>
                {awayTeam?.name ?? 'TBD'}
              </span>
            </div>
          </div>

          {/* Game meta */}
          <div className="mt-4 pt-4 border-t border-gray-100 text-center space-y-1">
            <p className="text-sm text-gray-600">
              {gameDate} · {gameTime}
              {rawGame.court ? ` · ${rawGame.court}` : ''}
            </p>
            <p className="text-xs text-gray-400">
              {league?.name ?? ''}
              {rawGame.week_number != null && league?.event_type !== 'tournament'
                ? ` · Week ${rawGame.week_number}`
                : ''}
            </p>
          </div>

          {/* RSVP + attendance — upcoming, non-cancelled games where player has a role */}
          {isUpcoming && !isCancelled && !isPostponed && (attendanceCounts || myTeamId) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-3 flex-wrap">
                {attendanceCounts && captainTeamIdForGame && (
                  <GameAttendancePanel
                    gameId={rawGame.id}
                    teamId={captainTeamIdForGame}
                    initialCounts={attendanceCounts}
                    isCaptain={true}
                    gameSubs={captainGameSubsList}
                  />
                )}
                {myTeamId && (
                  <GameRsvpButton
                    gameId={rawGame.id}
                    teamId={myTeamId}
                    initialStatus={rsvpStatus}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Head-to-head section ── */}
        {h2hGames.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Head to Head · {league?.name}
            </h2>

            {/* W/L summary — only if there are completed games */}
            {hasH2hHistory && (
              <div className="bg-white border rounded-xl p-4 mb-3 flex items-center justify-center gap-6 sm:gap-10">
                <div className="text-center">
                  <p className="text-2xl font-bold">{homeWins}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-tight">{homeTeam?.name}</p>
                </div>
                {draws > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-400">{draws}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Draws</p>
                  </div>
                )}
                <div className="text-center">
                  <p className="text-2xl font-bold">{awayWins}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-tight">{awayTeam?.name}</p>
                </div>
              </div>
            )}

            {/* Meetings list */}
            <div className="space-y-2">
              {h2hGames.map((g) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const gHome = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team as any
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const gAway = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team as any
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const gResult = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results as any
                const { date: gDate, time: gTime } = formatGameTime(g.scheduled_at, timezone)
                const isThis = g.id === gameId
                const gIsCancelled = g.status === 'cancelled' || g.status === 'postponed'
                const gDone = gResult?.status === 'confirmed'

                return (
                  <Link
                    key={g.id}
                    href={`/games/${g.id}`}
                    className={`block bg-white rounded-lg px-4 py-3 transition-shadow hover:shadow-sm ${
                      gIsCancelled ? 'opacity-60' : ''
                    }`}
                    style={isThis
                      ? { border: '2px solid var(--brand-primary)' }
                      : { border: '1px solid #e5e7eb' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Teams + score */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {gHome?.name ?? 'TBD'}
                          {gDone ? ` ${gResult.home_score} – ${gResult.away_score} ` : ' vs '}
                          {gAway?.name ?? 'TBD'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {gDate} · {gTime}
                          {g.court ? ` · ${g.court}` : ''}
                        </p>
                      </div>

                      {/* Status / badge */}
                      <div className="shrink-0">
                        {isThis ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            This game
                          </span>
                        ) : gIsCancelled ? (
                          <span className="text-xs font-semibold text-red-500 bg-red-50 rounded-full px-2 py-0.5">
                            {g.status === 'postponed' ? 'Postponed' : 'Cancelled'}
                          </span>
                        ) : gDone ? (
                          <span className="text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5">
                            Final
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
                            Upcoming
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

      </div>

      <Footer org={org} />
    </div>
  )
}
