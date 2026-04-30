import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { RequestJoinButton } from '@/components/teams/request-join-button'
import { SessionJoinButton } from '@/components/sessions/session-join-button'
import { CaptainScoreEntry } from '@/components/scores/captain-score-entry'
import { EventRulesModal } from '@/components/events/event-rules-modal'
import { BracketView } from '@/components/bracket/bracket-view'
import type { BracketData, BracketMatchData } from '@/components/bracket/bracket-view'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatGameTime } from '@/lib/format-time'

// ── Tab nav ───────────────────────────────────────────────────────────────────

function TabNav({ slug, activeTab, tabs }: { slug: string; activeTab: string; tabs: { id: string; label: string }[] }) {
  return (
    <div className="border-b sticky top-16 z-30 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/events/${slug}?tab=${tab.id}`}
              className={`shrink-0 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-current text-current'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              style={activeTab === tab.id ? { color: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' } : {}}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

// ── Standings helpers ─────────────────────────────────────────────────────────

interface TeamStat {
  id: string
  name: string
  division_id: string | null
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
}

function StandingsTable({ teams }: { teams: TeamStat[] }) {
  const sorted = [...teams].sort(
    (a, b) => b.wins - a.wins || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
  )
  if (sorted.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-8">No results yet.</p>
  }
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[340px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500 w-8">#</th>
              <th className="px-4 py-3 font-medium text-gray-500">Team</th>
              <th className="px-3 py-3 font-medium text-gray-500 text-center">W</th>
              <th className="px-3 py-3 font-medium text-gray-500 text-center">L</th>
              <th className="px-3 py-3 font-medium text-gray-500 text-center">PF</th>
              <th className="px-3 py-3 font-medium text-gray-500 text-center">PA</th>
              <th className="px-3 py-3 font-medium text-gray-500 text-center">Diff</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, i) => (
              <tr key={team.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                <td className="px-4 py-3 font-medium">{team.name}</td>
                <td className="px-3 py-3 text-center font-semibold" style={{ color: 'var(--brand-primary)' }}>{team.wins}</td>
                <td className="px-3 py-3 text-center text-gray-500">{team.losses}</td>
                <td className="px-3 py-3 text-center text-gray-500">{team.pointsFor}</td>
                <td className="px-3 py-3 text-center text-gray-500">{team.pointsAgainst}</td>
                <td className="px-3 py-3 text-center text-gray-500">
                  {team.pointsFor - team.pointsAgainst > 0 ? '+' : ''}{team.pointsFor - team.pointsAgainst}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Schedule helpers ──────────────────────────────────────────────────────────

type SetScore = { home: number; away: number }

type GameRow = {
  id: string
  scheduled_at: string
  court: string | null
  status: string
  week_number: number | null
  home_team_id: string | null
  away_team_id: string | null
  home_team: { id: string; name: string } | { id: string; name: string }[] | null
  away_team: { id: string; name: string } | { id: string; name: string }[] | null
  game_results: {
    home_score: number | null
    away_score: number | null
    status: string
    submitted_by: string | null
    sets?: SetScore[] | null
  } | {
    home_score: number | null
    away_score: number | null
    status: string
    submitted_by: string | null
    sets?: SetScore[] | null
  }[] | null
}

function DateGroup({
  date, games, timezone, isPast, captainTeamIds, userId, sport,
}: {
  date: string
  games: GameRow[]
  timezone: string
  isPast: boolean
  captainTeamIds: Set<string>
  userId: string | null
  sport: string | null
}) {
  return (
    <div>
      <p className={`text-sm font-semibold mb-2 ${isPast ? 'text-gray-400' : 'text-gray-700'}`}>{date}</p>
      <div className="space-y-2">
        {games.map((game) => {
          const homeTeam = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
          const awayTeam = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
          const result = Array.isArray(game.game_results) ? game.game_results[0] : game.game_results
          const { time: gameTime } = formatGameTime(game.scheduled_at, timezone)
          const homeTeamId = homeTeam?.id ?? game.home_team_id ?? ''
          const awayTeamId = awayTeam?.id ?? game.away_team_id ?? ''
          const isCaptainOfHome = captainTeamIds.has(homeTeamId)
          const isCaptainOfAway = captainTeamIds.has(awayTeamId)
          const isCaptain = isCaptainOfHome || isCaptainOfAway
          const submittedByOpponent = result?.submitted_by != null && result.submitted_by !== userId

          return (
            <div key={game.id} className={`bg-white rounded-lg border p-4 ${isPast ? 'opacity-80' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-14 shrink-0 text-xs text-gray-400 tabular-nums">{gameTime}</div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${isPast ? 'text-gray-500' : ''}`}>
                    {homeTeam?.name ?? 'TBD'}
                    <span className="mx-2 font-normal text-gray-400">vs</span>
                    {awayTeam?.name ?? 'TBD'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                    {game.court && <span>Court {game.court}</span>}
                    {game.week_number && <><span>·</span><span>Wk {game.week_number}</span></>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {result && result.home_score !== null && result.away_score !== null ? (
                    <div>
                      <p className="font-bold tabular-nums text-sm">{result.home_score} – {result.away_score}</p>
                      {result.sets && result.sets.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {result.sets.map((s: SetScore) => `${s.home}–${s.away}`).join(', ')}
                        </p>
                      )}
                      <p className={`text-[10px] mt-0.5 ${result.status === 'confirmed' ? 'text-green-600' : 'text-amber-600'}`}>
                        {result.status === 'confirmed' ? '✓ confirmed' : 'pending'}
                      </p>
                    </div>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      game.status === 'completed' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {game.status === 'completed' ? 'Final' : game.status}
                    </span>
                  )}
                </div>
              </div>
              {isPast && isCaptain && result?.status !== 'confirmed' && (
                <CaptainScoreEntry
                  gameId={game.id}
                  sport={sport}
                  homeTeamName={homeTeam?.name ?? 'Home'}
                  awayTeamName={awayTeam?.name ?? 'Away'}
                  isCaptainOfHome={isCaptainOfHome}
                  isCaptainOfAway={isCaptainOfAway}
                  existingResult={result ? {
                    homeScore: result.home_score,
                    awayScore: result.away_score,
                    status: result.status,
                    submittedByOpponent,
                    sets: result.sets ?? null,
                  } : null}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string; invite?: string; mode?: string }>
}) {
  const { slug } = await params
  const { tab: rawTab, invite: inviteToken, mode: urlMode } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const db = createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: league }, { data: branding }] = await Promise.all([
    (supabase as any).from('leagues').select('*').eq('organization_id', org.id).eq('slug', slug).neq('status', 'draft').single(),
    supabase.from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
  ])

  if (!league) notFound()

  const timezone = branding?.timezone ?? 'America/Toronto'
  const isPickupEvent = league.event_type === 'pickup'
  const isSessionBased = league.event_type === 'drop_in'  // pickup is always season, not session-based
  const isTeamBased = league.event_type === 'league' || league.event_type === 'tournament'
  const isSeasonPickup = isPickupEvent || (league.event_type === 'drop_in' && league.registration_mode === 'season')
  const isPrivatePickup = (isPickupEvent || isSessionBased) && league.pickup_join_policy === 'private'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dropInPriceCents: number | null = (league as any).drop_in_price_cents ?? null
  const hasDropIn = dropInPriceCents !== null

  // Check if logged-in user has a valid season invite for this private event
  const hasSeasonInvite = (isPrivatePickup && user)
    ? await (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (db as any)
          .from('pickup_invites')
          .select('id')
          .eq('league_id', league.id)
          .eq('email', user.email!.toLowerCase())
          .eq('invite_type', 'season')
          .in('status', ['pending', 'accepted'])
          .maybeSingle()
        return !!data
      })()
    : false

  // Check if logged-in user has a pending drop-in invite (by email or by the token in the URL)
  const hasDropInInvite = (hasDropIn && user)
    ? await (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const query = (db as any)
          .from('pickup_invites')
          .select('id')
          .eq('league_id', league.id)
          .eq('invite_type', 'drop_in')
          .eq('status', 'pending')
        // Match by token (from email link) OR by the logged-in user's email
        const { data } = inviteToken
          ? await query.eq('token', inviteToken).maybeSingle()
          : await query.eq('email', user.email!.toLowerCase()).maybeSingle()
        return !!data
      })()
    : false

  // A drop-in invite is present in the URL (may be for an unauthenticated visitor)
  const dropInInviteInUrl = urlMode === 'drop_in' && !!inviteToken
  // The return-to URL to use in login redirects from this page
  const returnPath = `/events/${slug}${inviteToken ? `?invite=${inviteToken}${urlMode ? `&mode=${urlMode}` : ''}` : ''}`

  // Check for published bracket (lightweight — just need to know if one exists)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: publishedBracketMeta } = isTeamBased
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('brackets')
        .select('id')
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .not('published_at', 'is', null)
        .limit(1)
        .single()
    : { data: null }

  const hasBracket = !!publishedBracketMeta

  // Tabs: session-based events only show Overview
  const tabs = isTeamBased
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'schedule', label: 'Schedule' },
        { id: 'standings', label: 'Standings' },
        ...(hasBracket ? [{ id: 'bracket', label: 'Bracket' }] : []),
      ]
    : [{ id: 'overview', label: 'Overview' }]

  const validTab = tabs.map((t) => t.id)
  const activeTab = validTab.includes(rawTab ?? '') ? (rawTab ?? 'overview') : 'overview'

  // ── Overview data ─────────────────────────────────────────────────────────

  // Sessions (pickup/drop-in)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions } = isSessionBased
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('event_sessions')
        .select('id, scheduled_at, duration_minutes, capacity, location_override, notes, status, session_registrations(count)')
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
    : { data: null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mySessionRegs } = (isSessionBased && !isSeasonPickup && !isPickupEvent && user)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('session_registrations')
        .select('session_id')
        .eq('league_id', league.id)
        .eq('user_id', user.id)
        .eq('status', 'registered')
    : { data: null }
  const mySessionIds = new Set((mySessionRegs ?? []).map((r: { session_id: string }) => r.session_id))

  const { data: mySeasonRegistration } = ((isPickupEvent || isSeasonPickup) && user)
    ? await supabase.from('registrations').select('id, status')
        .eq('league_id', league.id).eq('organization_id', org.id).eq('user_id', user.id)
        .eq('registration_type' as never, 'season').maybeSingle()
    : { data: null }

  // Teams list (for open-registration team events)
  const canJoinTeam = isTeamBased && league.team_join_policy !== 'admin_only' && league.league_type === 'team'
  const { data: teams } = isTeamBased
    ? await supabase
        .from('teams')
        .select('id, name, color, team_members(id, status)')
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .eq('status', 'active')
        .order('name')
    : { data: null }

  const { data: myMemberships } = (user && teams)
    ? await supabase.from('team_members').select('team_id').eq('user_id', user.id).in('team_id', teams.map((t) => t.id))
    : { data: null }

  const { data: myRequests } = (user && teams)
    ? await supabase.from('team_join_requests').select('team_id, status').eq('user_id', user.id).eq('status', 'pending').in('team_id', teams.map((t) => t.id))
    : { data: null }

  const myTeamIds = new Set(myMemberships?.map((m) => m.team_id) ?? [])
  const myRequestTeamIds = new Set(myRequests?.map((r) => r.team_id) ?? [])

  const { data: myRegistration } = (user && isTeamBased)
    ? await supabase.from('registrations').select('id, status').eq('league_id', league.id).eq('organization_id', org.id).eq('user_id', user.id).single()
    : { data: null }

  const isOpen = league.status === 'registration_open' || league.status === 'active'
  const isRegOpen = league.status === 'registration_open'
  const price = league.price_cents === 0 ? 'Free' : `$${(league.price_cents / 100).toFixed(0)} ${league.currency?.toUpperCase()}`
  const dropInPriceLabel = dropInPriceCents !== null
    ? (dropInPriceCents === 0 ? 'Free drop-in' : `$${(dropInPriceCents / 100).toFixed(0)} drop-in`)
    : null

  // ── Schedule tab data ─────────────────────────────────────────────────────

  let games: GameRow[] = []
  let captainTeamIds = new Set<string>()

  if (activeTab === 'schedule' && isTeamBased) {
    const { data: gamesData } = await supabase
      .from('games')
      .select(`
        id, scheduled_at, court, status, week_number,
        home_team_id, away_team_id,
        home_team:teams!games_home_team_id_fkey(id, name),
        away_team:teams!games_away_team_id_fkey(id, name),
        game_results(home_score, away_score, status, submitted_by, sets)
      `)
      .eq('organization_id', org.id)
      .eq('league_id', league.id)
      .order('scheduled_at', { ascending: true })

    games = (gamesData ?? []) as GameRow[]

    if (user) {
      const { data: captainships } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .eq('role', 'captain')
        .eq('status', 'active')
      for (const c of captainships ?? []) captainTeamIds.add(c.team_id)
    }
  }

  // ── Standings tab data ────────────────────────────────────────────────────

  let standingsTeams: TeamStat[] = []
  let divisions: { id: string; name: string; sort_order: number }[] = []

  if (activeTab === 'standings' && isTeamBased) {
    const [{ data: teamsData }, { data: divsData }, { data: resultsData }] = await Promise.all([
      supabase.from('teams').select('id, name, division_id').eq('league_id', league.id).eq('organization_id', org.id).eq('status', 'active'),
      supabase.from('divisions').select('id, name, sort_order').eq('league_id', league.id).eq('organization_id', org.id).order('sort_order'),
      supabase.from('game_results')
        .select('home_score, away_score, status, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status)')
        .eq('organization_id', org.id)
        .eq('status', 'confirmed'),
    ])

    divisions = divsData ?? []

    const record: Record<string, { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }> = {}
    const leagueTeamIds = new Set((teamsData ?? []).map((t) => t.id))

    for (const r of resultsData ?? []) {
      const game = Array.isArray(r.game) ? r.game[0] : r.game
      if (!game || game.status !== 'completed' || game.league_id !== league.id) continue
      const { home_team_id: ht, away_team_id: at } = game
      if (!ht || !at || !leagueTeamIds.has(ht) || !leagueTeamIds.has(at)) continue
      if (!record[ht]) record[ht] = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }
      if (!record[at]) record[at] = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }
      const hs = r.home_score ?? 0
      const as_ = r.away_score ?? 0
      record[ht].pointsFor += hs; record[ht].pointsAgainst += as_
      record[at].pointsFor += as_; record[at].pointsAgainst += hs
      if (hs > as_) { record[ht].wins++; record[at].losses++ }
      else if (as_ > hs) { record[at].wins++; record[ht].losses++ }
      else { record[ht].ties++; record[at].ties++ }
    }

    standingsTeams = (teamsData ?? []).map((t) => ({
      ...t,
      division_id: t.division_id ?? null,
      ...(record[t.id] ?? { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }),
    }))
  }

  // ── Bracket tab data ─────────────────────────────────────────────────────

  let bracketData: BracketData | null = null

  if (activeTab === 'bracket' && hasBracket) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawBracket } = await (db as any)
      .from('brackets')
      .select(`
        id, name, bracket_size, third_place_game, status, published_at,
        bracket_matches(
          id, round_number, match_number,
          team1_id, team2_id, team1_seed, team2_seed,
          is_bye, winner_team_id, score1, score2, status,
          winner_to_match_id, scheduled_at, court, notes
        )
      `)
      .eq('league_id', league.id)
      .eq('organization_id', org.id)
      .not('published_at', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (rawBracket) {
      // Build team name map from teams already fetched (or fetch them)
      const { data: bracketTeams } = await db
        .from('teams')
        .select('id, name')
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
      const teamNameMap = new Map((bracketTeams ?? []).map((t) => [t.id, t.name]))

      bracketData = {
        id: rawBracket.id,
        name: rawBracket.name,
        bracketSize: rawBracket.bracket_size,
        thirdPlaceGame: rawBracket.third_place_game,
        status: rawBracket.status,
        matches: (rawBracket.bracket_matches ?? []).map((m: {
          id: string; round_number: number; match_number: number;
          team1_id: string|null; team2_id: string|null; team1_seed: number|null; team2_seed: number|null;
          is_bye: boolean; winner_team_id: string|null; score1: number|null; score2: number|null;
          status: string; winner_to_match_id: string|null; scheduled_at: string|null; court: string|null; notes: string|null;
        }): BracketMatchData => ({
          id: m.id,
          roundNumber: m.round_number,
          matchNumber: m.match_number,
          team1Id: m.team1_id,
          team2Id: m.team2_id,
          team1Name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? null) : null,
          team2Name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? null) : null,
          team1Seed: m.team1_seed,
          team2Seed: m.team2_seed,
          isBye: m.is_bye,
          winnerTeamId: m.winner_team_id,
          score1: m.score1,
          score2: m.score2,
          status: m.status as BracketMatchData['status'],
          scheduledAt: m.scheduled_at,
          court: m.court,
          notes: m.notes,
          winnerToMatchId: m.winner_to_match_id,
        })),
      }
    }
  }

  // ── Schedule grouping ─────────────────────────────────────────────────────

  const now = new Date()
  const byDate = new Map<string, GameRow[]>()
  for (const game of games) {
    const { date } = formatGameTime(game.scheduled_at, timezone)
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push(game)
  }
  const dateGroups = Array.from(byDate.entries())
  const upcomingGroups = dateGroups.filter(([, g]) => new Date(g[0].scheduled_at) >= now)
  const pastGroups = dateGroups.filter(([, g]) => new Date(g[0].scheduled_at) < now)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      {/* ── Event header ── */}
      <div style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-5">
          <Link href="/events" className="text-xs opacity-60 hover:opacity-90 transition-opacity">← All Events</Link>
          <h1 className="text-3xl sm:text-4xl font-bold uppercase mt-2" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            {league.name}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              isRegOpen ? 'bg-green-400/20 text-green-200' : 'bg-white/10 text-white/70'
            }`}>
              {isRegOpen ? 'Open for Registration' : league.status === 'active' ? 'In Season' : league.status === 'completed' ? 'Completed' : league.status}
            </span>
            {league.sport && (
              <span className="text-sm opacity-70 capitalize">{league.sport.replace(/_/g, ' ')}</span>
            )}
            <span className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>{price}</span>
            {dropInPriceLabel && (
              <span className="text-sm text-white/60">{dropInPriceLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      {tabs.length > 1 && <TabNav slug={slug} activeTab={activeTab} tabs={tabs} />}

      {/* ── Tab content ── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* ──────────────── OVERVIEW TAB ──────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {league.description && (
              <p className="text-gray-700 leading-relaxed">{league.description}</p>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {league.age_group && (
                <div className="bg-white rounded-lg border p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Age Group</p>
                  <p className="font-semibold mt-1">{league.age_group}</p>
                </div>
              )}
              {league.season_start_date && (
                <div className="bg-white rounded-lg border p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    {league.event_type === 'league' ? 'Season Start' : 'Event Date'}
                  </p>
                  <p className="font-semibold mt-1">
                    {new Date(league.season_start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}
              {league.season_end_date && (
                <div className="bg-white rounded-lg border p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Season End</p>
                  <p className="font-semibold mt-1">
                    {new Date(league.season_end_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}
              {league.registration_closes_at && isRegOpen && (
                <div className="bg-white rounded-lg border p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Reg. Closes</p>
                  <p className="font-semibold mt-1">
                    {new Date(league.registration_closes_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}
              {isTeamBased && league.max_teams && (
                <div className="bg-white rounded-lg border p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Max Teams</p>
                  <p className="font-semibold mt-1">{league.max_teams}</p>
                </div>
              )}
              {isTeamBased && league.min_team_size && league.max_team_size && (
                <div className="bg-white rounded-lg border p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Team Size</p>
                  <p className="font-semibold mt-1">{league.min_team_size}–{league.max_team_size} players</p>
                </div>
              )}
            </div>

            {/* Venue */}
            {(league.venue_name || league.venue_address) && (
              <div className="bg-white rounded-lg border p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Location</p>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {league.venue_name && <p className="font-semibold">{league.venue_name}</p>}
                    {league.venue_address && <p className="text-sm text-gray-600 mt-0.5">{league.venue_address}</p>}
                    {(league.venue_type || league.venue_surface) && (
                      <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-500">
                        {league.venue_type && <span className="capitalize">{league.venue_type}</span>}
                        {league.venue_type && league.venue_surface && <span>·</span>}
                        {league.venue_surface && <span>{league.venue_surface}</span>}
                      </div>
                    )}
                  </div>
                  {league.venue_address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(league.venue_address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full border hover:bg-gray-50 transition-colors"
                      style={{ color: 'var(--brand-primary)' }}
                      aria-label="View on Google Maps"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Organizer */}
            {(league.organizer_name || league.organizer_email || league.organizer_phone) && (
              <div className="bg-white rounded-lg border p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Organizer</p>
                {league.organizer_name && <p className="font-semibold">{league.organizer_name}</p>}
                {league.organizer_email && (
                  <a href={`mailto:${league.organizer_email}`} className="text-sm text-blue-600 hover:underline mt-1 block">
                    {league.organizer_email}
                  </a>
                )}
                {league.organizer_phone && <p className="text-sm text-gray-600 mt-1">{league.organizer_phone}</p>}
              </div>
            )}

            {/* Rules */}
            {league.rules_content && (
              <div className="bg-white rounded-lg border p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Event Rules</p>
                <EventRulesModal content={league.rules_content} />
              </div>
            )}

            {/* Season pickup CTA */}
            {isSeasonPickup && (
              mySeasonRegistration ? (
                <div className="w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide bg-green-50 border border-green-200 text-green-700" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                  ✓ You&apos;re enrolled for the season
                  {mySeasonRegistration.status === 'pending' && (
                    <span className="block text-sm font-normal normal-case text-green-600 mt-1">Your registration is pending approval</span>
                  )}
                </div>
              ) : isRegOpen ? (
                <>
                  {(!isPrivatePickup || hasSeasonInvite) && (
                    <Link
                      href={`/register/${league.slug}`}
                      className="inline-block w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: 'var(--brand-primary)', fontFamily: 'var(--brand-heading-font)' }}
                    >
                      Register for the Season
                    </Link>
                  )}
                  {isPrivatePickup && !hasSeasonInvite && !user && (
                    <Link
                      href={`/login?redirect=${encodeURIComponent(returnPath)}`}
                      className="inline-block w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: 'var(--brand-primary)', fontFamily: 'var(--brand-heading-font)' }}
                    >
                      Log in to register
                    </Link>
                  )}
                  {isPrivatePickup && !hasSeasonInvite && user && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                      This is a private event. Contact the organiser to request an invitation.
                    </div>
                  )}
                </>
              ) : null
            )}

            {/* Drop-in CTA */}
            {isPickupEvent && hasDropIn && !mySeasonRegistration && (hasDropInInvite || dropInInviteInUrl) && (
              <div className="bg-white border rounded-lg p-5">
                <p className="text-sm font-semibold mb-1">Drop-in Available</p>
                <p className="text-sm text-gray-600 mb-3">
                  You&apos;ve been invited to join as a drop-in.
                  {dropInPriceCents ? ` Fee: $${(dropInPriceCents / 100).toFixed(0)}` : ' Free'}
                </p>
                {user ? (
                  <Link
                    href={`/register/${league.slug}?mode=drop_in${inviteToken ? `&invite=${inviteToken}` : ''}`}
                    className="inline-block px-6 py-2.5 rounded-md font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Register as Drop-in
                  </Link>
                ) : (
                  <Link
                    href={`/login?redirect=${encodeURIComponent(returnPath)}`}
                    className="inline-block px-6 py-2.5 rounded-md font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Log in to Register as Drop-in
                  </Link>
                )}
              </div>
            )}

            {/* Sessions (drop-in events only) */}
            {isSessionBased && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="font-bold text-lg" style={{ fontFamily: 'var(--brand-heading-font)' }}>Upcoming Sessions</h2>
                  {isSeasonPickup && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Season pass</span>
                  )}
                  {!isSeasonPickup && isPrivatePickup && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">Invite only</span>
                  )}
                </div>
                {isPrivatePickup && !isSeasonPickup && user && !hasSeasonInvite && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 mb-3">
                    This is a private event. Contact the organiser to request an invitation.
                  </div>
                )}

                {(!sessions || sessions.length === 0) ? (
                  <p className="text-gray-400 text-sm py-8 text-center bg-white border rounded-lg">No sessions scheduled yet — check back soon.</p>
                ) : (
                  <div className="space-y-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(sessions as any[]).map((s) => {
                      const registeredCount = s.session_registrations?.[0]?.count ?? 0
                      const isFull = s.capacity !== null && registeredCount >= s.capacity
                      const isJoined = mySessionIds.has(s.id)
                      const isCancelled = s.status === 'cancelled'
                      const remaining = s.capacity !== null ? s.capacity - registeredCount : null
                      return (
                        <div key={s.id} className={`bg-white border rounded-lg p-4 flex items-center justify-between gap-4 ${isCancelled ? 'opacity-50' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-sm">
                                {new Date(s.scheduled_at).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </p>
                              {isCancelled && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>}
                              {!isSeasonPickup && isJoined && !isCancelled && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Joined ✓</span>}
                              {isSeasonPickup && mySeasonRegistration && !isCancelled && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Enrolled ✓</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                              <span>{s.duration_minutes} min</span>
                              {s.location_override && <><span>·</span><span>{s.location_override}</span></>}
                              {!isCancelled && (remaining === null
                                ? <span>{registeredCount} registered</span>
                                : isFull
                                  ? <span className={`font-medium ${isSeasonPickup ? 'text-amber-600' : 'text-red-600'}`}>Full ({s.capacity} spots)</span>
                                  : <span className="text-green-700 font-medium">{remaining} of {s.capacity} spots left</span>
                              )}
                            </div>
                            {s.notes && <p className="text-xs text-gray-400 mt-1">{s.notes}</p>}
                          </div>
                          {!isSeasonPickup && (
                            <div className="shrink-0">
                              {isPrivatePickup ? (
                                hasSeasonInvite ? (
                                  <SessionJoinButton
                                    sessionId={s.id}
                                    leagueId={league.id}
                                    isJoined={isJoined}
                                    isFull={isFull}
                                    isCancelled={isCancelled}
                                    isLoggedIn={!!user}
                                  />
                                ) : !user ? (
                                  <a
                                    href={`/login?redirect=${encodeURIComponent(returnPath)}`}
                                    className="px-4 py-1.5 rounded-md text-sm font-semibold text-white"
                                    style={{ backgroundColor: 'var(--brand-primary)' }}
                                  >
                                    Log in to join
                                  </a>
                                ) : null
                              ) : (
                                <SessionJoinButton
                                  sessionId={s.id}
                                  leagueId={league.id}
                                  isJoined={isJoined}
                                  isFull={isFull}
                                  isCancelled={isCancelled}
                                  isLoggedIn={!!user}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Teams list (open registration) */}
            {canJoinTeam && teams && teams.length > 0 && (
              <div>
                <h2 className="font-bold text-lg mb-3" style={{ fontFamily: 'var(--brand-heading-font)' }}>Teams</h2>
                <div className="space-y-2">
                  {teams.map((team) => {
                    const memberCount = (team.team_members ?? []).filter((m: { status: string }) => m.status === 'active').length
                    const isMember = myTeamIds.has(team.id)
                    const hasRequest = myRequestTeamIds.has(team.id)
                    return (
                      <div key={team.id} className="bg-white rounded-lg border p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {team.color && <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />}
                          <div>
                            <p className="font-semibold">{team.name}</p>
                            <p className="text-xs text-gray-500">{memberCount} player{memberCount !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div>
                          {isMember ? (
                            <span className="text-xs text-green-600 font-medium">You&apos;re on this team</span>
                          ) : hasRequest ? (
                            <span className="text-xs text-amber-600 font-medium">Request pending…</span>
                          ) : (league.team_join_policy !== 'admin_only' && myRegistration) ? (
                            <RequestJoinButton teamId={team.id} teamName={team.name} />
                          ) : !myRegistration ? (
                            <span className="text-xs text-gray-400">Register to join</span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Registration CTA */}
            {isTeamBased && (
              myRegistration ? (
                <div className="w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide bg-green-50 border border-green-200 text-green-700" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                  ✓ You&apos;re registered
                  {myRegistration.status === 'pending' && (
                    <span className="block text-sm font-normal normal-case text-green-600 mt-1">Your registration is pending approval</span>
                  )}
                </div>
              ) : isOpen ? (
                <Link
                  href={`/register/${league.slug}`}
                  className="inline-block w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--brand-primary)', fontFamily: 'var(--brand-heading-font)' }}
                >
                  Register Now
                </Link>
              ) : null
            )}
          </div>
        )}

        {/* ──────────────── SCHEDULE TAB ──────────────── */}
        {activeTab === 'schedule' && (
          <div>
            {games.length === 0 ? (
              <p className="text-gray-500 text-center py-16">No games scheduled yet.</p>
            ) : (
              <div className="space-y-10">
                {upcomingGroups.length > 0 && (
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Upcoming</p>
                    <div className="space-y-6">
                      {upcomingGroups.map(([date, dayGames]) => (
                        <DateGroup key={date} date={date} games={dayGames} timezone={timezone} isPast={false} captainTeamIds={captainTeamIds} userId={user?.id ?? null} sport={league.sport ?? null} />
                      ))}
                    </div>
                  </section>
                )}
                {pastGroups.length > 0 && (
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Results</p>
                    <div className="space-y-6">
                      {[...pastGroups].reverse().map(([date, dayGames]) => (
                        <DateGroup key={date} date={date} games={dayGames} timezone={timezone} isPast captainTeamIds={captainTeamIds} userId={user?.id ?? null} sport={league.sport ?? null} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {/* ──────────────── STANDINGS TAB ──────────────── */}
        {activeTab === 'standings' && (
          <div>
            {standingsTeams.length === 0 ? (
              <p className="text-gray-500 text-center py-16">No teams yet.</p>
            ) : divisions.length > 0 ? (
              <div className="space-y-8">
                {divisions.map((div) => {
                  const divTeams = standingsTeams.filter((t) => t.division_id === div.id)
                  return (
                    <div key={div.id}>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">{div.name}</p>
                      <StandingsTable teams={divTeams} />
                    </div>
                  )
                })}
                {standingsTeams.filter((t) => !t.division_id).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Unassigned</p>
                    <StandingsTable teams={standingsTeams.filter((t) => !t.division_id)} />
                  </div>
                )}
              </div>
            ) : (
              <StandingsTable teams={standingsTeams} />
            )}
          </div>
        )}

        {/* ──────────────── BRACKET TAB ──────────────── */}
        {activeTab === 'bracket' && (
          <div>
            {!bracketData ? (
              <p className="text-gray-500 text-center py-16">Bracket not available yet.</p>
            ) : (
              <BracketView bracket={bracketData} leagueId={league.id} />
            )}
          </div>
        )}

      </div>
      <Footer org={org} />
    </div>
  )
}
