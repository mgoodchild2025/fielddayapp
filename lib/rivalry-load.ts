import type { createServiceRoleClient } from '@/lib/supabase/service'
import { normalizeTeamName } from '@/lib/team-name-match'
import { yearInTimezone } from '@/lib/format-time'
import { buildRivalry, ilikeExact, isGenericTeamName, type Meeting, type Rivalry } from '@/lib/rivalry'

type Db = ReturnType<typeof createServiceRoleClient>
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

/**
 * Two team names' all-time record in this org (side A = `aName`): every
 * confirmed, non-forfeit game and every completed playoff match between teams
 * with those names, in any event. Null when either name is a placeholder.
 */
export async function loadRivalry(db: Db, orgId: string, aName: string, bName: string, timeZone: string): Promise<Rivalry | null> {
  const aKey = normalizeTeamName(aName)
  const bKey = normalizeTeamName(bName)
  if (!aKey || !bKey || aKey === bKey || isGenericTeamName(aName) || isGenericTeamName(bName)) return null

  const [{ data: aTeams }, { data: bTeams }] = await Promise.all([
    db.from('teams').select('id, name, league_id').eq('organization_id', orgId).ilike('name', ilikeExact(aName)).limit(200),
    db.from('teams').select('id, name, league_id').eq('organization_id', orgId).ilike('name', ilikeExact(bName)).limit(200),
  ])
  const A = (aTeams ?? []).filter((t) => normalizeTeamName(t.name) === aKey).map((t) => t.id)
  const B = (bTeams ?? []).filter((t) => normalizeTeamName(t.name) === bKey).map((t) => t.id)
  if (A.length === 0 || B.length === 0) return null
  const aSet = new Set(A)
  const a = A.join(','), b = B.join(',')

  const [{ data: games }, { data: matches }] = await Promise.all([
    db.from('games')
      .select('scheduled_at, home_team_id, league:leagues!games_league_id_fkey(id, name), game_results!inner(home_score, away_score, status, is_forfeit)')
      .eq('organization_id', orgId)
      .or(`and(home_team_id.in.(${a}),away_team_id.in.(${b})),and(home_team_id.in.(${b}),away_team_id.in.(${a}))`)
      .eq('game_results.status', 'confirmed')
      .limit(1000),
    db.from('bracket_matches')
      .select('scheduled_at, scored_at, team1_id, score1, score2, winner_team_id, bracket:brackets!bracket_matches_bracket_id_fkey(league:leagues(id, name))')
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .eq('is_bye', false)
      .is('game_id', null)
      .or(`and(team1_id.in.(${a}),team2_id.in.(${b})),and(team1_id.in.(${b}),team2_id.in.(${a}))`)
      .limit(1000),
  ])

  const meetings: Meeting[] = []
  for (const g of games ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = one((g as any).game_results) as { home_score: number | null; away_score: number | null; is_forfeit: boolean | null } | null
    if (!r || r.is_forfeit || r.home_score == null || r.away_score == null || !g.scheduled_at) continue
    const aHome = aSet.has(g.home_team_id ?? '')
    const my = aHome ? r.home_score : r.away_score
    const their = aHome ? r.away_score : r.home_score
    const lg = one(g.league as unknown) as { id: string; name: string } | null
    meetings.push({ at: g.scheduled_at, a: my, b: their, outcome: my > their ? 'W' : my < their ? 'L' : 'T', eventId: lg?.id ?? '', eventName: lg?.name ?? '' })
  }
  for (const m of matches ?? []) {
    const at = m.scheduled_at ?? m.scored_at
    if (!at || !m.winner_team_id) continue
    const aFirst = aSet.has(m.team1_id ?? '')
    const lg = one((one(m.bracket as unknown) as { league: unknown } | null)?.league) as { id: string; name: string } | null
    meetings.push({
      at,
      a: aFirst ? m.score1 : m.score2,
      b: aFirst ? m.score2 : m.score1,
      outcome: aSet.has(m.winner_team_id) ? 'W' : 'L',
      eventId: lg?.id ?? '', eventName: lg?.name ?? '',
    })
  }
  if (meetings.length === 0) return null
  return buildRivalry(meetings, (iso) => yearInTimezone(iso, timeZone))
}
