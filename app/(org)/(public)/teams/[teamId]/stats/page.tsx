import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { TeamStatsTabs } from '@/components/teams/team-stats-client'
import { StatsLeaderboard } from '@/components/stats/stats-leaderboard'
import { getStatDefinitions, getLeagueStatTotals } from '@/actions/stats'
import type { LeaderboardPlayer } from '@/components/stats/stats-leaderboard'
import type { SeasonResult, H2HRecord } from '@/components/teams/team-stats-client'
import { formatGameTime } from '@/lib/format-time'
import { sortStandings, isVolleyballSport, computePts, accumulateGameResult, emptyTeamStat, computeStreaks, type TeamStatTotals, type PtsMethod, type VolleyballMode } from '@/lib/standings'
import { fetchLeaguePlayoffGames } from '@/lib/playoff-games'

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
  const { data: team } = await db.from('teams').select(`
    id, name, color, logo_url, league_id,
    league:leagues!teams_league_id_fkey(id, name, slug, sport, status, standings_pts_method, volleyball_standings_mode)
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
    db.from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),

    // Games involving this team
    db.from('games').select(`
      id, scheduled_at, court, week_number, status, home_team_id, away_team_id,
      pool_id,
      home_team:teams!games_home_team_id_fkey(id, name, color, logo_url),
      away_team:teams!games_away_team_id_fkey(id, name, color, logo_url),
      game_results(home_score, away_score, status, sets)
    `)
      .eq('organization_id', org.id)
      .eq('league_id', leagueId)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true }),

    // All league games (for standings)
    db.from('games').select(`
      id, home_team_id, away_team_id,
      game_results(home_score, away_score, status, sets, is_forfeit, forfeit_team_id)
    `)
      .eq('organization_id', org.id)
      .eq('league_id', leagueId)
      .neq('status', 'cancelled'),

    // All teams (for standings denominator)
    db.from('teams').select('id').eq('league_id', leagueId).eq('organization_id', org.id),

    sport ? getStatDefinitions(org.id, sport) : Promise.resolve([]),
    leagueId ? getLeagueStatTotals(leagueId, org.id) : Promise.resolve({} as Record<string, Record<string, number>>),

    // Active team members with profiles
    db.from('team_members').select(`
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

  // Pool names for the Regular Season / Pool badge on results
  const { data: poolRows } = await db.from('pools').select('id, name').eq('league_id', leagueId).eq('organization_id', org.id)
  const poolNameById = new Map<string, string>(((poolRows ?? []) as any[]).map((p: any) => [p.id as string, p.name as string]))

  // Published playoff bracket games involving this team
  const playoffGames = await fetchLeaguePlayoffGames(db, org.id, leagueId)

  // ── Sport-specific scoring label ─────────────────────────────────────────
  function scoringLabel(s: string | null): string {
    switch (s) {
      case 'volleyball':
      case 'beach_volleyball': return 'Sets'
      case 'baseball':
      case 'softball':        return 'Runs'
      case 'basketball':      return 'Points'
      case 'tennis':
      case 'pickleball':      return 'Sets'
      default:                return 'Goals'
    }
  }
  const scoringUnit = scoringLabel(sport)

  // ── Compute season record ─────────────────────────────────────────────────
  // Trailing W/L/T run for the hero chip — confirmed games only.
  const teamStreak = computeStreaks(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (teamGames as any[])
      .map((tg) => ({ tg, result: Array.isArray(tg.game_results) ? tg.game_results[0] : tg.game_results }))
      .filter(({ result }) => result?.status === 'confirmed')
      .map(({ tg, result }) => ({
        homeTeamId: tg.home_team_id,
        awayTeamId: tg.away_team_id,
        homeScore: result.home_score,
        awayScore: result.away_score,
        scheduledAt: tg.scheduled_at ?? '',
      }))
  ).get(teamId) ?? null

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

  // ── Compute league standings using the event's configured standings mode ──
  // Mirrors the standings tab (lib/standings.ts) so the rank shown here matches:
  // volleyball set-based → set wins etc.; otherwise wins → configured PTS method.
  const ptsMethod: PtsMethod = ((league?.standings_pts_method as string) ?? 'wins') as PtsMethod
  const volleyballMode: VolleyballMode = ((league?.volleyball_standings_mode as string) ?? 'match_based') as VolleyballMode
  const isVolleyball = isVolleyballSport(sport)

  const statMap = new Map<string, TeamStatTotals>(
    allTeamIds.map(id => [id, emptyTeamStat()])
  )
  for (const g of allLeagueGames) {
    const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results
    if (!result || result.status !== 'confirmed') continue
    accumulateGameResult(statMap, {
      homeTeamId: g.home_team_id as string, awayTeamId: g.away_team_id as string,
      homeScore: result.home_score, awayScore: result.away_score,
      sets: result.sets, isForfeit: result.is_forfeit, forfeitTeamId: result.forfeit_team_id,
    }, isVolleyball)
  }
  const rankedTeams = sortStandings(
    [...statMap.entries()].map(([id, s]) => ({ id, name: '', ...s })),
    sport,
    volleyballMode,
    ptsMethod,
  )
  const standing = (() => {
    const idx = rankedTeams.findIndex(t => t.id === teamId)
    return idx >= 0 ? idx + 1 : null
  })()
  const totalTeams = allTeamIds.length

  // ── Points box, adapted to the event's standings mode ─────────────────────
  // Mirrors the standings tab: set-based volleyball ranks on set wins;
  // match-based volleyball shows the configured PTS method; other sports keep
  // the classic 3-1-0 points model.
  const myStat = statMap.get(teamId) ?? emptyTeamStat()
  const ptsBox: { label: string; value: number; hint: string } = (() => {
    if (isVolleyball && volleyballMode === 'set_based') {
      return { label: 'Set Wins', value: myStat.setWins, hint: `${myStat.setLosses} set losses` }
    }
    if (isVolleyball) {
      const hints: Record<PtsMethod, string> = {
        wins: '1 per win',
        set_wins: 'sets won',
        set_differential: 'SW − SL',
        points_for: 'points scored',
      }
      return { label: 'Points', value: computePts({ id: teamId, name: '', ...myStat }, ptsMethod), hint: hints[ptsMethod] }
    }
    return { label: 'Points', value: points, hint: '3W · 1T · 0L' }
  })()

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

    // Per-set scores from this team's perspective (volleyball only)
    let setScores: { mine: number; theirs: number }[] | null = null
    if (isVolleyball && result?.status === 'confirmed' && Array.isArray(result.sets) && result.sets.length > 0) {
      setScores = (result.sets as { home: number; away: number }[]).map((s) => ({
        mine: isHome ? s.home : s.away,
        theirs: isHome ? s.away : s.home,
      }))
    }

    seasonResults.push({
      gameId: g.id as string,
      scheduledAt: g.scheduled_at as string,
      dateLabel: formatGameTime(g.scheduled_at as string, timezone).date,
      opponentId: (opp?.id ?? '') as string,
      opponentName: (opp?.name ?? 'TBD') as string,
      opponentColor: (opp?.color ?? null) as string | null,
      opponentLogoUrl: (opp?.logo_url ?? null) as string | null,
      homeScore: result?.home_score ?? null,
      awayScore: result?.away_score ?? null,
      setScores,
      poolName: g.pool_id ? (poolNameById.get(g.pool_id) ?? null) : null,
      isHome,
      outcome,
    })
  }

  // Append this team's playoff bracket games (team1 treated as home).
  for (const pg of playoffGames) {
    const isTeam1 = pg.team1Id === teamId
    const isTeam2 = pg.team2Id === teamId
    if (!isTeam1 && !isTeam2) continue
    // Skip matches that are neither scheduled nor played yet.
    if (!pg.scheduledAt && !(pg.score1 != null && pg.score2 != null)) continue

    const isHome = isTeam1
    const oppId = isHome ? pg.team2Id : pg.team1Id
    const oppName = isHome ? pg.team2Name : pg.team1Name
    let outcome: SeasonResult['outcome'] = 'upcoming'
    if (pg.status === 'completed' && pg.score1 != null && pg.score2 != null) {
      const my = isHome ? pg.score1 : pg.score2
      const their = isHome ? pg.score2 : pg.score1
      outcome = my > their ? 'W' : my < their ? 'L' : 'T'
    }
    let setScores: { mine: number; theirs: number }[] | null = null
    if (isVolleyball && Array.isArray(pg.sets) && pg.sets.length > 0) {
      setScores = pg.sets.map((s) => ({
        mine: isHome ? s.home : s.away,
        theirs: isHome ? s.away : s.home,
      }))
    }

    seasonResults.push({
      gameId: pg.matchId,
      scheduledAt: pg.scheduledAt ?? '',
      dateLabel: pg.scheduledAt ? formatGameTime(pg.scheduledAt, timezone).date : 'TBD',
      opponentId: oppId ?? '',
      opponentName: oppName,
      opponentColor: null,
      opponentLogoUrl: null,
      homeScore: pg.score1,
      awayScore: pg.score2,
      setScores,
      poolName: null,
      isPlayoff: true,
      isHome,
      outcome,
    })
  }

  // Keep everything in date order (unscheduled playoff games sort last).
  seasonResults.sort((a, b) => {
    const at = a.scheduledAt || '￿'
    const bt = b.scheduledAt || '￿'
    return at < bt ? -1 : at > bt ? 1 : 0
  })

  const resultsHavePools = seasonResults.some((r) => !!r.poolName || !!r.isPlayoff)

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
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
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
                {teamStreak && (
                  <span className={`ml-2 align-middle px-1.5 py-0.5 rounded text-xs font-bold tabular-nums ${teamStreak.startsWith('W') ? 'bg-green-50 text-green-700' : teamStreak.startsWith('L') ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'}`} title={teamStreak.startsWith('W') ? `${teamStreak.slice(1)}-game win streak` : teamStreak.startsWith('L') ? `${teamStreak.slice(1)}-game losing streak` : `${teamStreak.slice(1)} straight ties`}>
                    {teamStreak}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-400 mt-1.5">{played} played</p>
            </div>

            <div className="bg-white rounded-xl border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{ptsBox.label}</p>
              <p className="text-2xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--brand-primary)' }}>
                {ptsBox.value}
              </p>
              <p className="text-[11px] text-gray-400 mt-1.5">{ptsBox.hint}</p>
            </div>

            <div className="bg-white rounded-xl border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{scoringUnit}</p>
              <p className="text-2xl font-extrabold tracking-tight leading-none text-gray-800">
                <span style={{ color: 'var(--brand-primary)' }}>{goalsFor}</span>
                <span className="text-gray-300 font-light mx-0.5">–</span>
                <span>{goalsAgainst}</span>
              </p>
              <p className={`text-[11px] mt-1.5 ${goalDiff > 0 ? '' : goalDiff < 0 ? 'text-red-500' : 'text-gray-400'}`}
                 style={goalDiff > 0 ? { color: 'var(--brand-primary)' } : undefined}>
                {goalDiff > 0 ? '+' : ''}{goalDiff} {scoringUnit.toLowerCase()} diff
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

        {/* ── Results / Head to Head / Players (tabbed) ── */}
        <TeamStatsTabs
          pastResults={pastResults}
          upcomingResults={upcomingResults}
          h2h={h2hList}
          showKind={resultsHavePools}
          playersSlot={
            statDefs.length > 0
              ? <StatsLeaderboard statDefs={statDefs} players={leaderboardPlayers} />
              : undefined
          }
        />

      </div>

      <Footer org={org} />
    </div>
  )
}
