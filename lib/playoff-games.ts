import { getRoundName } from '@/lib/bracket'

/** A published playoff bracket match, normalized for schedule/results display. */
export interface PlayoffGame {
  matchId: string
  bracketName: string
  roundLabel: string
  scheduledAt: string | null
  court: string | null
  team1Id: string | null
  team2Id: string | null
  team1Name: string
  team2Name: string
  score1: number | null
  score2: number | null
  /** Per-set scores mapped to home(team1)/away(team2). */
  sets: { home: number; away: number }[] | null
  status: string
}

/**
 * Fetch the published playoff matches for a league and normalize them for
 * display in schedules and team results. Byes are skipped. Team names resolve
 * from real teams, falling back to placeholder labels ("Winner QF-1").
 */
export async function fetchLeaguePlayoffGames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  leagueId: string,
): Promise<PlayoffGame[]> {
  const { data: rawBrackets } = await db
    .from('brackets')
    .select(`
      id, name, bracket_size, published_at,
      bracket_matches(
        id, round_number, match_number, team1_id, team2_id, team1_label, team2_label,
        is_bye, score1, score2, sets, status, scheduled_at, court
      )
    `)
    .eq('league_id', leagueId)
    .eq('organization_id', orgId)
    .not('published_at', 'is', null)
    .order('created_at', { ascending: true })

  if (!rawBrackets || rawBrackets.length === 0) return []

  const { data: teamRows } = await db
    .from('teams')
    .select('id, name')
    .eq('league_id', leagueId)
    .eq('organization_id', orgId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamNameMap = new Map<string, string>((teamRows ?? []).map((t: any) => [t.id as string, t.name as string]))

  const games: PlayoffGame[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of rawBrackets as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (b.bracket_matches ?? []) as any[]) {
      if (m.is_bye) continue
      const sets = Array.isArray(m.sets)
        ? (m.sets as { s1: number; s2: number }[]).map((s) => ({ home: s.s1, away: s.s2 }))
        : null
      games.push({
        matchId: m.id as string,
        bracketName: b.name as string,
        roundLabel: getRoundName(m.round_number as number, b.bracket_size as number, m.match_number as number),
        scheduledAt: m.scheduled_at ?? null,
        court: m.court ?? null,
        team1Id: m.team1_id ?? null,
        team2Id: m.team2_id ?? null,
        team1Name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? m.team1_label ?? 'TBD') : (m.team1_label ?? 'TBD'),
        team2Name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? m.team2_label ?? 'TBD') : (m.team2_label ?? 'TBD'),
        score1: m.score1 ?? null,
        score2: m.score2 ?? null,
        sets,
        status: m.status as string,
      })
    }
  }
  return games
}

/** Minimal team info for rendering avatars on schedule cards. */
interface TeamMini { id: string; name: string; color: string | null; logo_url: string | null }

/**
 * A player's playoff bracket match, shaped like a `games` row so it can be
 * merged into the dashboard and My Games lists. Read-only (bracket-managed):
 * these ids are bracket_match ids, not games ids, so callers must not offer
 * RSVP / subs / score entry on them.
 */
export interface PlayerPlayoffRow {
  id: string
  league_id: string
  scheduled_at: string
  court: string | null
  status: string
  week_number: number | null
  home_team_id: string | null
  away_team_id: string | null
  home_team: TeamMini | null
  away_team: TeamMini | null
  league: { name: string; slug: string; schedule_published: boolean; event_type: string | null } | null
  game_results: { home_score: number | null; away_score: number | null; status: string }[] | null
  isPlayoff: true
  playoffTier: string
  playoffRound: string
}

/**
 * Fetch published playoff matches across the given leagues that involve one of
 * `teamIds`, shaped like `games` rows (team1 = home). Only scheduled matches
 * (with a date) are returned. Empty when there are no leagues/teams.
 */
export async function fetchPlayerPlayoffGameRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  leagueIds: string[],
  teamIds: string[],
): Promise<PlayerPlayoffRow[]> {
  if (leagueIds.length === 0 || teamIds.length === 0) return []
  const teamSet = new Set(teamIds)

  const [{ data: rawBrackets }, { data: leagueRows }, { data: teamRows }] = await Promise.all([
    db.from('brackets')
      .select(`
        id, name, bracket_size, league_id, published_at,
        bracket_matches(
          id, round_number, match_number, team1_id, team2_id,
          is_bye, score1, score2, status, scheduled_at, court
        )
      `)
      .in('league_id', leagueIds)
      .eq('organization_id', orgId)
      .not('published_at', 'is', null),
    db.from('leagues').select('id, name, slug, schedule_published, event_type').in('id', leagueIds).eq('organization_id', orgId),
    db.from('teams').select('id, name, color, logo_url').in('league_id', leagueIds).eq('organization_id', orgId),
  ])

  if (!rawBrackets || rawBrackets.length === 0) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueMap = new Map<string, any>((leagueRows ?? []).map((l: any) => [l.id, l]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamMap = new Map<string, TeamMini>((teamRows ?? []).map((t: any) => [t.id, { id: t.id, name: t.name, color: t.color ?? null, logo_url: t.logo_url ?? null }]))

  const rows: PlayerPlayoffRow[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of rawBrackets as any[]) {
    const lg = leagueMap.get(b.league_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (b.bracket_matches ?? []) as any[]) {
      if (m.is_bye || !m.scheduled_at) continue
      if (!(teamSet.has(m.team1_id) || teamSet.has(m.team2_id))) continue
      const home = m.team1_id ? teamMap.get(m.team1_id) ?? null : null
      const away = m.team2_id ? teamMap.get(m.team2_id) ?? null : null
      const scored = m.score1 != null && m.score2 != null
      rows.push({
        id: m.id,
        league_id: b.league_id,
        scheduled_at: m.scheduled_at,
        court: m.court ?? null,
        status: m.status === 'completed' ? 'completed' : 'scheduled',
        week_number: null,
        home_team_id: m.team1_id ?? null,
        away_team_id: m.team2_id ?? null,
        home_team: home,
        away_team: away,
        league: lg ? { name: lg.name, slug: lg.slug, schedule_published: true, event_type: lg.event_type ?? null } : null,
        game_results: scored ? [{ home_score: m.score1, away_score: m.score2, status: 'confirmed' }] : null,
        isPlayoff: true,
        playoffTier: b.name,
        playoffRound: getRoundName(m.round_number, b.bracket_size, m.match_number),
      })
    }
  }
  return rows
}
