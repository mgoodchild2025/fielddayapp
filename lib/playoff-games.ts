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
        id, round_number, team1_id, team2_id, team1_label, team2_label,
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
        roundLabel: getRoundName(m.round_number as number, b.bracket_size as number),
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
