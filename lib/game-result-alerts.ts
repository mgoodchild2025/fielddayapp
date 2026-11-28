import type { createServiceRoleClient } from '@/lib/supabase/service'
import { createNotifications } from '@/lib/notify'
import { outcomeFor, winStreak, resultAlert, isFreshResult, nightAlert, nightStillPlaying, orgNight, type NightResult, type Outcome } from '@/lib/game-result'
import { getOrgTimezone } from '@/lib/tenant'
import { parseLocalToUtc } from '@/lib/format-time'

/**
 * Post-game result alerts and the data behind the shareable result card.
 * Not a server action (nothing here checks the caller): the score actions call
 * `sendGameResultAlerts` after they have confirmed a result, and the result
 * card route calls `loadResultForTeam` for a team the viewer is on.
 */

type Db = ReturnType<typeof createServiceRoleClient>
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export interface TeamSideResult {
  gameId: string
  leagueName: string
  scheduledAt: string | null
  court: string | null
  isExhibition: boolean
  outcome: Outcome
  myTeam: { id: string; name: string; color: string | null }
  opponent: { id: string; name: string; color: string | null }
  myScore: number
  theirScore: number
  sets: { my: number; their: number }[] | null
  /** Wins in a row for my team in this event, through this game. */
  streak: number
}

/** The confirmed result of a game from one team's side, or null (not confirmed, a forfeit, not their game). */
export async function loadResultForTeam(db: Db, orgId: string, gameId: string, teamId: string): Promise<TeamSideResult | null> {
  const { data: g } = await db
    .from('games')
    .select(`
      id, league_id, scheduled_at, court, is_exhibition, home_team_id, away_team_id,
      home:teams!games_home_team_id_fkey(id, name, color),
      away:teams!games_away_team_id_fkey(id, name, color),
      league:leagues!games_league_id_fkey(name),
      game_results(home_score, away_score, sets, status, is_forfeit)
    `)
    .eq('id', gameId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!g) return null
  const r = one(g.game_results as unknown)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = r as any
  if (!res || res.status !== 'confirmed' || res.is_forfeit || res.home_score == null || res.away_score == null) return null
  const home = one(g.home as unknown) as { id: string; name: string; color: string | null } | null
  const away = one(g.away as unknown) as { id: string; name: string; color: string | null } | null
  if (!home || !away) return null
  const isHome = teamId === home.id
  if (!isHome && teamId !== away.id) return null

  const myScore = isHome ? res.home_score : res.away_score
  const theirScore = isHome ? res.away_score : res.home_score
  const sets = Array.isArray(res.sets) && res.sets.length > 0
    ? (res.sets as { home: number; away: number }[]).map((s) => ({ my: isHome ? s.home : s.away, their: isHome ? s.away : s.home }))
    : null
  const outcome = outcomeFor(myScore, theirScore)

  // Streak: this team's confirmed results in the event up to this game.
  let streak = 0
  if (outcome === 'W' && g.league_id) {
    const { data: games } = await db
      .from('games')
      .select('id, scheduled_at, home_team_id, game_results!inner(home_score, away_score, status)')
      .eq('organization_id', orgId)
      .eq('league_id', g.league_id)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .eq('game_results.status', 'confirmed')
      .lte('scheduled_at', g.scheduled_at ?? new Date().toISOString())
      .order('scheduled_at', { ascending: true })
    const outcomes: Outcome[] = []
    for (const x of games ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xr = one((x as any).game_results) as { home_score: number | null; away_score: number | null } | null
      if (!xr || xr.home_score == null || xr.away_score == null) continue
      const mine = x.home_team_id === teamId
      outcomes.push(outcomeFor(mine ? xr.home_score : xr.away_score, mine ? xr.away_score : xr.home_score))
    }
    streak = Math.max(1, winStreak(outcomes))
  }

  return {
    gameId: g.id,
    leagueName: (one(g.league as unknown) as { name: string } | null)?.name ?? '',
    scheduledAt: g.scheduled_at,
    court: g.court ?? null,
    isExhibition: !!g.is_exhibition,
    outcome,
    myTeam: isHome ? home : away,
    opponent: isHome ? away : home,
    myScore,
    theirScore,
    sets,
    streak,
  }
}

type TeamRef = { name: string } | null

/**
 * Tells both teams' players how they did — ONCE PER TEAM PER NIGHT. Called
 * (after the response) when a game result first becomes confirmed; a team
 * that still has a game or playoff match later today (org time) without a
 * final result is held, and the last result of its night sends one alert
 * covering every result. A notification already sent for that team + night is
 * the guard against a second. Old games (an organiser catching up) send
 * nothing; forfeits are left out of the summary. Never throws.
 */
export async function sendGameResultAlerts(db: Db, orgId: string, gameId: string): Promise<void> {
  try {
    const { data: game } = await db
      .from('games')
      .select('id, scheduled_at, home_team_id, away_team_id')
      .eq('id', gameId).eq('organization_id', orgId).maybeSingle()
    if (!game?.home_team_id || !game.away_team_id || !game.scheduled_at) return
    if (!isFreshResult(game.scheduled_at, Date.now())) return
    const tz = await getOrgTimezone(orgId)
    await Promise.all([game.home_team_id, game.away_team_id].map((t) => alertTeamNight(db, orgId, tz, t, game.scheduled_at!)))
  } catch (err) {
    console.error('[sendGameResultAlerts]', err)
  }
}

/** The playoff-match twin of sendGameResultAlerts (recordBracketScore / declareMatchWinner). Never throws. */
export async function sendBracketResultAlerts(db: Db, orgId: string, matchId: string): Promise<void> {
  try {
    const { data: m } = await db
      .from('bracket_matches')
      .select('id, scheduled_at, scored_at, team1_id, team2_id, game_id, is_bye')
      .eq('id', matchId).eq('organization_id', orgId).maybeSingle()
    // A match played as a games row alerts through that game.
    if (!m || m.is_bye || m.game_id || !m.team1_id || !m.team2_id) return
    const at = m.scheduled_at ?? m.scored_at ?? new Date().toISOString()
    if (!isFreshResult(at, Date.now())) return
    const tz = await getOrgTimezone(orgId)
    await Promise.all([m.team1_id, m.team2_id].map((t) => alertTeamNight(db, orgId, tz, t, at)))
  } catch (err) {
    console.error('[sendBracketResultAlerts]', err)
  }
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function alertTeamNight(db: Db, orgId: string, tz: string, teamId: string, anchorIso: string): Promise<void> {
  const night = orgNight(anchorIso, tz)
  const start = parseLocalToUtc(night, '00:00', tz)
  const end = parseLocalToUtc(nextDay(night), '00:00', tz)

  const [{ data: already }, { data: games }, { data: matches }] = await Promise.all([
    db.from('notifications').select('id')
      .eq('organization_id', orgId).eq('type', 'game_result')
      .eq('data->>team_id', teamId).eq('data->>night', night)
      .limit(1),
    db.from('games')
      .select(`
        id, scheduled_at, home_team_id, away_team_id,
        home:teams!games_home_team_id_fkey(name),
        away:teams!games_away_team_id_fkey(name),
        game_results(home_score, away_score, status, is_forfeit)
      `)
      .eq('organization_id', orgId)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .gte('scheduled_at', start).lt('scheduled_at', end)
      .not('status', 'in', '(cancelled,postponed)'),
    db.from('bracket_matches')
      .select(`
        id, scheduled_at, status, score1, score2, team1_id, team2_id, winner_team_id,
        team1:teams!bracket_matches_team1_id_fkey(name),
        team2:teams!bracket_matches_team2_id_fkey(name),
        bracket:brackets!bracket_matches_bracket_id_fkey(league:leagues(slug))
      `)
      .eq('organization_id', orgId)
      .eq('is_bye', false)
      .is('game_id', null)
      .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
      .gte('scheduled_at', start).lt('scheduled_at', end),
  ])
  if (already && already.length > 0) return

  type Item = NightResult & { at: string; gameId: string | null; slug: string | null; forfeit: boolean }
  const items: (Item | null)[] = []
  const status: { done: boolean }[] = []
  for (const g of games ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = one((g as any).game_results) as { home_score: number | null; away_score: number | null; status: string; is_forfeit: boolean | null } | null
    const done = r?.status === 'confirmed'
    status.push({ done })
    if (!done || r!.home_score == null || r!.away_score == null) continue
    const home = g.home_team_id === teamId
    const my = home ? r!.home_score : r!.away_score
    const their = home ? r!.away_score : r!.home_score
    items.push({
      outcome: outcomeFor(my, their), my, their,
      opponent: (one((home ? g.away : g.home) as unknown) as TeamRef)?.name ?? 'opponent',
      at: g.scheduled_at ?? '', gameId: g.id, slug: null, forfeit: !!r!.is_forfeit,
    })
  }
  for (const m of matches ?? []) {
    const done = m.status === 'completed'
    status.push({ done })
    if (!done || !m.winner_team_id) continue
    const first = m.team1_id === teamId
    const bracket = one(m.bracket as unknown) as { league: unknown } | null
    items.push({
      outcome: m.winner_team_id === teamId ? 'W' : 'L',
      my: first ? m.score1 : m.score2,
      their: first ? m.score2 : m.score1,
      opponent: (one((first ? m.team2 : m.team1) as unknown) as TeamRef)?.name ?? 'opponent',
      at: m.scheduled_at ?? '', gameId: null,
      slug: (one(bracket?.league) as { slug: string } | null)?.slug ?? null,
      forfeit: false,
    })
  }
  if (nightStillPlaying(status)) return

  const results = (items.filter(Boolean) as Item[]).filter((r) => !r.forfeit).sort((a, b) => a.at.localeCompare(b.at))
  if (results.length === 0) return
  const last = results[results.length - 1]
  const lastGame = [...results].reverse().find((r) => r.gameId)

  let title: string, body: string
  if (results.length === 1 && last.gameId) {
    const side = await loadResultForTeam(db, orgId, last.gameId, teamId)
    if (!side) return
    ;({ title, body } = resultAlert({
      outcome: side.outcome, myScore: side.myScore, theirScore: side.theirScore,
      opponent: side.opponent.name, streak: side.streak, sets: side.sets,
    }))
  } else {
    // A streak only when tonight ended on a game win (regular-season games carry it).
    const streak = last.gameId && last.outcome === 'W'
      ? (await loadResultForTeam(db, orgId, last.gameId, teamId))?.streak ?? 0
      : 0
    ;({ title, body } = nightAlert(results, streak))
  }

  const { data: members } = await db.from('team_members')
    .select('user_id').eq('team_id', teamId).eq('status', 'active')
  const userIds = [...new Set((members ?? []).map((m) => m.user_id).filter((u): u is string => !!u))]
  if (userIds.length === 0) return

  const link = lastGame
    ? { game_id: lastGame.gameId, href: `/games/${lastGame.gameId}#result`, link_label: 'See your result card' }
    : { href: last.slug ? `/events/${last.slug}?tab=bracket` : '/dashboard', link_label: 'See the bracket' }
  await createNotifications(userIds.map((userId) => ({
    organization_id: orgId,
    user_id: userId,
    type: 'game_result',
    title,
    body,
    data: { team_id: teamId, night, ...link },
  })))
}
