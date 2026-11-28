import type { createServiceRoleClient } from '@/lib/supabase/service'
import { createNotifications } from '@/lib/notify'
import { outcomeFor, winStreak, resultAlert, isFreshResult, type Outcome } from '@/lib/game-result'

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

/**
 * Tells both teams' players their result, once per game. Called (after the
 * response) by the score actions when a result FIRST becomes confirmed; a
 * notification already sent for the game is the guard against a second one
 * (cleared and re-entered, two confirms racing). Old games (an organiser
 * catching up) and forfeits send nothing. Never throws.
 */
export async function sendGameResultAlerts(db: Db, orgId: string, gameId: string): Promise<void> {
  try {
    const { data: game } = await db
      .from('games')
      .select('id, scheduled_at, home_team_id, away_team_id')
      .eq('id', gameId).eq('organization_id', orgId).maybeSingle()
    if (!game?.home_team_id || !game.away_team_id) return
    if (!isFreshResult(game.scheduled_at, Date.now())) return

    const { data: already } = await db
      .from('notifications')
      .select('id')
      .eq('organization_id', orgId)
      .eq('type', 'game_result')
      .eq('data->>game_id', gameId)
      .limit(1)
    if (already && already.length > 0) return

    const [homeSide, awaySide, { data: members }] = await Promise.all([
      loadResultForTeam(db, orgId, gameId, game.home_team_id),
      loadResultForTeam(db, orgId, gameId, game.away_team_id),
      db.from('team_members')
        .select('team_id, user_id')
        .in('team_id', [game.home_team_id, game.away_team_id])
        .eq('status', 'active'),
    ])
    if (!homeSide || !awaySide) return

    const rows = []
    const seen = new Set<string>()
    for (const m of members ?? []) {
      if (!m.user_id || seen.has(m.user_id)) continue
      seen.add(m.user_id)
      const side = m.team_id === game.home_team_id ? homeSide : awaySide
      const { title, body } = resultAlert({
        outcome: side.outcome, myScore: side.myScore, theirScore: side.theirScore,
        opponent: side.opponent.name, streak: side.streak, sets: side.sets,
      })
      rows.push({
        organization_id: orgId,
        user_id: m.user_id,
        type: 'game_result',
        title,
        body,
        data: { game_id: gameId, href: `/games/${gameId}#result`, link_label: 'See your result card' },
      })
    }
    if (rows.length > 0) await createNotifications(rows)
  } catch (err) {
    console.error('[sendGameResultAlerts]', err)
  }
}
