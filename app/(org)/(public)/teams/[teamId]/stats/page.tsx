import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { TeamStatsClient } from '@/components/teams/team-stats-client'
import { StatsLeaderboard } from '@/components/stats/stats-leaderboard'
import { getStatDefinitions, getLeagueStatTotals } from '@/actions/stats'
import type { LeaderboardPlayer } from '@/components/stats/stats-leaderboard'
import type { SeasonResult, H2HRecord } from '@/components/teams/team-stats-client'
import { formatGameTime } from '@/lib/format-time'

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function TeamStatsPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // Team stats are publicly viewable — no auth required

  // ── Fetch team + league info ──────────────────────────────────────────────
  const { data: team } = await (db as any).from('teams').select(`
    id, name, color, logo_url, league_id,
    league:leagues!teams_league_id_fkey(id, name, slug, sport, status)
  `).eq('id', teamId).eq('organization_id', org.id).maybeSingle()

  if (!team) notFound()

  const league = Array.isArray(team.league) ? (team.league as any[])[0] : team.league as any
  const leagueId = team.league_id as string
  const sport = (league?.sport as string | null) ?? null

  // ── Parallel data fetch ───────────────────────────────────────────────────
  const [
    { data: branding },
    teamGamesResult,
    allLeagueGamesResult,
    allLeagueTeamsResult,
    statDefs,
    seasonTotals,
    teamMembersResult,
  ] = await Promise.all([
    (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),

    // Games involving this team
    (db as any).from('games').select(`
      id, scheduled_at, court, week_number, status, home_team_id, away_team_id,
      home_team:teams!games_home_team_id_fkey(id, name, color, logo_url),
      away_team:teams!games_away_team_id_fkey(id, name, color, logo_url),
      game_results(home_score, away_score, status)
    `)
      .eq('organization_id', org.id)
      .eq('league_id', leagueId)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true }),

    // All league games (for standings)
    (db as any).from('games').select(`
      id, home_team_id, away_team_id,
      game_results(home_score, away_score, status)
    `)
      .eq('organization_id', org.id)
      .eq('league_id', leagueId)
      .neq('status', 'cancelled'),

    // All teams (for standings denominator)
    db.from('teams').select('id').eq('league_id', leagueId).eq('organization_id', org.id),

    sport ? getStatDefinitions(org.id, sport) : Promise.resolve([]),
    leagueId ? getLeagueStatTotals(leagueId, org.id) : Promise.resolve({} as Record<string, Record<string, number>>),

    // Active team members with profiles
    (db as any).from('team_members').select(`
      user_id,
      profile:profiles!team_members_user_id_fkey(id, full_name, avatar_url)
    `)
      .eq('team_id', teamId)
      .eq('organization_id', org.id)
      .eq('status', 'active'),
  ])

  const timezone = (branding as any)?.timezone ?? 'America/Toronto'
  const orgLogoUrl = (branding as any)?.logo_url ?? null

  const teamGames = (teamGamesResult.data ?? []) as any[]
  const allLeagueGames = (allLeagueGamesResult.data ?? []) as any[]
  const allTeamIds = ((allLeagueTeamsResult.data ?? []) as { id: string }[]).map(t => t.id)

  // ── Compute season record ─────────────────────────────────────────────────
  let wins = 0, losses = 0, ties = 0, played = 0, goalsFor = 0, goalsAgainst = 0
  for (const g of teamGames) {
    const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results
    if (!result || result.status !== 'confirmed') continue
    const isHome = g.home_team_id === teamId
    const myScore = isHome ? (result.home_score ?? 0) : (result.away_score ?? 0)
    const theirScore = isHome ? (result.away_score ?? 0) : (result.home_score ?? 0)
    played++
    goalsFor += myScore
    goalsAgainst += theirScore
    if (myScore > theirScore) wins++
    else if (myScore < theirScore) losses++
    else ties++
  }
  const points = wins * 3 + ties
  const goalDiff = goalsFor - goalsAgainst

  // ── Compute league standings (all league games) ───────────────────────────
  const leagueRecord = new Map<string, { wins: number; losses: number; ties: number; points: number }>(
    allTeamIds.map(id => [id, { wins: 0, losses: 0, ties: 0, points: 0 }])
  )
  for (const g of allLeagueGames) {
    const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results
    if (!result || result.status !== 'confirmed') continue
    const ht = g.home_team_id as string
    const at = g.away_team_id as string
    if (!leagueRecord.has(ht)) leagueRecord.set(ht, { wins: 0, losses: 0, ties: 0, points: 0 })
    if (!leagueRecord.has(at)) leagueRecord.set(at, { wins: 0, losses: 0, ties: 0, points: 0 })
    const home = leagueRecord.get(ht)!
    const away = leagueRecord.get(at)!
    if (result.home_score > result.away_score) {
      home.wins++; home.points += 3; away.losses++
    } else if (result.away_score > result.home_score) {
      away.wins++; away.points += 3; home.losses++
    } else {
      home.ties++; home.points++; away.ties++; away.points++
    }
  }
  const standing = (() => {
    const sorted = [...leagueRecord.entries()].sort((a, b) => b[1].points - a[1].points)
    const idx = sorted.findIndex(([id]) => id === teamId)
    return idx >= 0 ? idx + 1 : null
  })()
  const totalTeams = allTeamIds.length

  // ── Build season results ──────────────────────────────────────────────────
  const seasonResults: SeasonResult[] = []
  for (const g of teamGames) {
    const isHome = g.home_team_id === teamId
    const opp = isHome
      ? (Array.isArray(g.away_team) ? g.away_team[0] : g.away_team)
      : (Array.isArray(g.home_team) ? g.home_team[0] : g.home_team)
    const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results

    let outcome: SeasonResult['outcome'] = 'upcoming'
    if (result?.status === 'confirmed') {
      const myScore  = isHome ? (result.home_score ?? 0) : (result.away_score ?? 0)
      const their    = isHome ? (result.away_score ?? 0) : (result.home_score ?? 0)
      outcome = myScore > their ? 'W' : myScore < their ? 'L' : 'T'
    }

    seasonResults.push({
      gameId: g.id as string,
      scheduledAt: g.scheduled_at as string,
      opponentId: (opp?.id ?? '') as string,
      opponentName: (opp?.name ?? 'TBD') as string,
      opponentColor: (opp?.color ?? null) as string | null,
      opponentLogoUrl: (opp?.logo_url ?? null) as string | null,
      homeScore: result?.home_score ?? null,
      awayScore: result?.away_score ?? null,
      isHome,
      outcome,
    })
  }

  // ── Build H2H ─────────────────────────────────────────────────────────────
  const h2hMap = new Map<string, H2HRecord>()
  for (const sr of seasonResults) {
    if (!sr.opponentId) continue
    if (!h2hMap.has(sr.opponentId)) {
      h2hMap.set(sr.opponentId, {
        opponentId: sr.opponentId,
        opponentName: sr.opponentName,
        opponentColor: sr.opponentColor,
        opponentLogoUrl: sr.opponentLogoUrl,
        wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
        games: [],
      })
    }
    const rec = h2hMap.get(sr.opponentId)!
    rec.games.push(sr)
    if (sr.outcome !== 'upcoming') {
      const myG  = sr.isHome ? (sr.homeScore ?? 0) : (sr.awayScore ?? 0)
      const oppG = sr.isHome ? (sr.awayScore ?? 0) : (sr.homeScore ?? 0)
      rec.goalsFor += myG
      rec.goalsAgainst += oppG
      if (sr.outcome === 'W') rec.wins++
      else if (sr.outcome === 'L') rec.losses++
      else rec.draws++
    }
  }
  const h2hList = [...h2hMap.values()].sort(
    (a, b) => (b.wins + b.draws + b.losses) - (a.wins + a.draws + a.losses) || a.opponentName.localeCompare(b.opponentName)
  )

  // ── Player stats leaderboard ──────────────────────────────────────────────
  const memberProfileMap = new Map<string, { full_name: string; avatar_url: string | null }>()
  for (const m of (teamMembersResult.data ?? []) as any[]) {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
    if (m.user_id && profile) {
      memberProfileMap.set(m.user_id, { full_name: profile.full_name, avatar_url: profile.avatar_url })
    }
  }
  const leaderboardPlayers: LeaderboardPlayer[] = [...memberProfileMap.keys()]
    .map((userId) => ({
      userId,
      name: memberProfileMap.get(userId)!.full_name ?? 'Unknown',
      avatarUrl: memberProfileMap.get(userId)!.avatar_url ?? null,
      teamName: team.name as string,
      totals: seasonTotals[userId] ?? {},
    }))
    .filter(p => Object.values(p.totals).some(v => v > 0))

  // ── Rendering helpers ─────────────────────────────────────────────────────
  function ordinal(n: number) {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return (s[(v - 20) % 10] ?? s[v] ?? s[0])
  }

  const upcomingResults = seasonResults.filter(r => r.outcome === 'upcoming')
  const pastResults     = seasonResults.filter(r => r.outcome !== 'upcoming') // already ascending from the games query

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={orgLogoUrl} />

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 flex-1 space-y-8 pb-24">

        {/* ── Back link ── */}
        <Link
          href={league?.slug ? `/events/${league.slug as string}` : '/schedule'}
          className="text-sm text-gray-500 hover:underline"
        >
          ← {league?.name ? (league.name as string) : 'Schedule'}
        </Link>

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <TeamAvatar
            logoUrl={(team.logo_url ?? null) as string | null}
            color={(team.color ?? null) as string | null}
            name={team.name as string}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              {team.name as string}
            </h1>
            {league && (
              <Link
                href={`/events/${league.slug ?? ''}`}
                className="text-sm text-gray-500 hover:underline mt-0.5 block"
              >
                {league.name as string}
              </Link>
            )}
          </div>
        </div>

        {/* ── Season Summary ── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Season Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

            <div className="bg-white rounded-xl border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Record</p>
              <p className="text-xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--brand-secondary)' }}>
                {wins}W&nbsp;{losses}L{ties > 0 ? ` ${ties}T` : ''}
              </p>
              <p className="text-[11px] text-gray-400 mt-1.5">{played} played</p>
            </div>

            <div className="bg-white rounded-xl border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Points</p>
              <p className="text-2xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--brand-primary)' }}>
                {points}
              </p>
              <p className="text-[11px] text-gray-400 mt-1.5">3W · 1T · 0L</p>
            </div>

            <div className="bg-white rounded-xl border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Goals</p>
              <p className="text-2xl font-extrabold tracking-tight leading-none text-gray-800">
                <span style={{ color: 'var(--brand-primary)' }}>{goalsFor}</span>
                <span className="text-gray-300 font-light mx-0.5">–</span>
                <span>{goalsAgainst}</span>
              </p>
              <p className={`text-[11px] mt-1.5 ${goalDiff > 0 ? '' : goalDiff < 0 ? 'text-red-500' : 'text-gray-400'}`}
                 style={goalDiff > 0 ? { color: 'var(--brand-primary)' } : undefined}>
                {goalDiff > 0 ? '+' : ''}{goalDiff} diff
              </p>
            </div>

            <div className="bg-white rounded-xl border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Standing</p>
              {standing !== null ? (
                <>
                  <p className="text-2xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--brand-primary)' }}>
                    {standing}<sup className="text-sm font-bold">{ordinal(standing)}</sup>
                    {totalTeams > 0 && <span className="text-sm font-semibold text-gray-400"> /{totalTeams}</span>}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1.5 truncate">{league?.name}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 mt-1">—</p>
              )}
            </div>
          </div>
        </section>

        {/* ── Season Results ── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Season Results</h2>
          {seasonResults.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-400">
              No games scheduled yet.
            </div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden divide-y">
              {pastResults.map(r => <ResultRow key={r.gameId} result={r} timezone={timezone} />)}
              {upcomingResults.map(r => <ResultRow key={r.gameId} result={r} timezone={timezone} />)}
            </div>
          )}
        </section>

        {/* ── Head to Head ── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Head to Head</h2>
          <TeamStatsClient h2h={h2hList} timezone={timezone} />
        </section>

        {/* ── Player Stats ── */}
        {statDefs.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Player Stats</h2>
            <StatsLeaderboard statDefs={statDefs} players={leaderboardPlayers} />
          </section>
        )}

      </div>

      <Footer org={org} />
    </div>
  )
}

// ── Result row ───────────────────────────────────────────────────────────────

function ResultRow({ result, timezone }: { result: SeasonResult; timezone: string }) {
  const { date: gameDate } = formatGameTime(result.scheduledAt, timezone)
  const myScore = result.isHome ? result.homeScore : result.awayScore
  const theirScore = result.isHome ? result.awayScore : result.homeScore

  return (
    // Outer div with relative positioning — absolute overlay handles game navigation,
    // z-10 opponent link sits above it so clicks on the name go to team stats.
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors relative">
      {/* Overlay link to game detail — sits beneath z-10 elements */}
      <Link href={`/games/${result.gameId}`} className="absolute inset-0" aria-label="View game" />

      <span className="text-xs text-gray-400 w-16 shrink-0 relative z-10">{gameDate}</span>

      <div className="flex items-center gap-2 flex-1 min-w-0 relative z-10">
        <TeamAvatar
          logoUrl={result.opponentLogoUrl}
          color={result.opponentColor}
          name={result.opponentName}
          size="xs"
        />
        {result.opponentId ? (
          <Link
            href={`/teams/${result.opponentId}/stats`}
            className="text-sm font-medium text-gray-700 hover:underline truncate"
          >
            {result.opponentName}
          </Link>
        ) : (
          <span className="text-sm font-medium text-gray-700 truncate">{result.opponentName}</span>
        )}
      </div>

      {result.outcome !== 'upcoming' && myScore !== null && theirScore !== null && (
        <span className="text-sm tabular-nums text-gray-600 shrink-0 relative z-10">
          {myScore}–{theirScore}
        </span>
      )}

      <div className="relative z-10">
        <OutcomeBadge outcome={result.outcome} />
      </div>
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: SeasonResult['outcome'] }) {
  if (outcome === 'upcoming') return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wide shrink-0">
      Upcoming
    </span>
  )
  const cfg = { W: 'bg-emerald-50 text-emerald-700', L: 'bg-red-50 text-red-600', T: 'bg-amber-50 text-amber-700' }[outcome]
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg} uppercase tracking-wide shrink-0`}>
      {outcome}
    </span>
  )
}
