import { createServiceRoleClient } from '@/lib/supabase/service'
import { parseLocalToUtc } from '@/lib/format-time'

/**
 * One day's scoring list for Courtside (admins) and Scorekeeping (volunteers):
 * the day's games and scheduled playoff bracket matches in the org timezone,
 * limited to `leagueIds` (null = every event; org admins).
 */

const NO_MATCH = ['00000000-0000-0000-0000-000000000000']

export type CourtsideTeam = { id: string; name: string; color: string | null; logo_url: string | null } | null

export type CourtsideGame = {
  id: string
  scheduled_at: string
  court: string | null
  league_id: string | null
  is_exhibition: boolean | null
  home: CourtsideTeam
  away: CourtsideTeam
  league: { id: string; name: string; sport: string | null } | null
  result: { home_score: number | null; away_score: number | null; status: string; sets: { home: number; away: number }[] | null } | null
}

export type CourtsideBracketMatch = {
  id: string
  scheduled_at: string
  court: string | null
  status: string
  round_number: number
  match_number: number
  score1: number | null
  score2: number | null
  team1: CourtsideTeam
  team2: CourtsideTeam
  bracket: { id: string; name: string; league_id: string; bracket_size: number; round_names: Record<string, string> | null } | null
}

export type CourtsideItem =
  | { kind: 'game'; when: string; row: CourtsideGame }
  | { kind: 'bracket'; when: string; row: CourtsideBracketMatch }

export type CourtsideDayData = {
  date: string
  todayLocal: string
  prevDate: string
  nextDate: string
  dayLabel: string
  games: CourtsideGame[]
  bracketMatches: CourtsideBracketMatch[]
  unscored: CourtsideItem[]
  awaiting: CourtsideItem[]
  scored: CourtsideItem[]
  /** UTC bounds of the day, for callers loading more (e.g. sessions). */
  dayStart: string
  dayEnd: string
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export function pickCourtsideDate(param: string | undefined, tz: string) {
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const date = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : todayLocal
  return { date, todayLocal }
}

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function loadCourtsideDay(opts: {
  orgId: string
  tz: string
  dateParam?: string
  leagueIds: string[] | null
}): Promise<CourtsideDayData> {
  const { orgId, tz, leagueIds } = opts
  const db = createServiceRoleClient()
  const { date, todayLocal } = pickCourtsideDate(opts.dateParam, tz)
  const nextDate = shiftDate(date, 1)
  const prevDate = shiftDate(date, -1)
  // Local-day bounds in UTC (DST-safe via the shared helper)
  const dayStart = parseLocalToUtc(date, '00:00', tz)
  const dayEnd = parseLocalToUtc(nextDate, '00:00', tz)
  const scope = leagueIds === null ? null : leagueIds.length > 0 ? leagueIds : NO_MATCH

  let gamesQuery = db
    .from('games')
    .select(`
      id, scheduled_at, court, status, league_id, is_exhibition,
      home_team:teams!games_home_team_id_fkey(id, name, color, logo_url),
      away_team:teams!games_away_team_id_fkey(id, name, color, logo_url),
      league:leagues!games_league_id_fkey(id, name, sport),
      game_results(home_score, away_score, status, sets)
    `)
    .eq('organization_id', orgId)
    // Postponed games aren't being played tonight — same rule as the
    // dashboard's Today card, so the two counts agree.
    .not('status', 'in', '(cancelled,postponed)')
    .gte('scheduled_at', dayStart)
    .lt('scheduled_at', dayEnd)
    .order('scheduled_at', { ascending: true })
  if (scope) gamesQuery = gamesQuery.in('league_id', scope)

  // Playoff bracket matches aren't games rows — pull the day's scheduled ones
  // too (both teams decided, byes excluded) so playoff night has a courtside.
  const bracketQuery = db
    .from('bracket_matches')
    .select(`
      id, scheduled_at, court, status, round_number, match_number, score1, score2,
      team1:teams!bracket_matches_team1_id_fkey(id, name, color, logo_url),
      team2:teams!bracket_matches_team2_id_fkey(id, name, color, logo_url),
      bracket:brackets!bracket_matches_bracket_id_fkey(id, name, league_id, bracket_size, round_names)
    `)
    .eq('organization_id', orgId)
    .eq('is_bye', false)
    .not('scheduled_at', 'is', null)
    .not('team1_id', 'is', null)
    .not('team2_id', 'is', null)
    .gte('scheduled_at', dayStart)
    .lt('scheduled_at', dayEnd)
    .order('scheduled_at', { ascending: true })

  const [{ data: gamesRaw }, { data: bracketRaw }] = await Promise.all([gamesQuery, bracketQuery])

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const games: CourtsideGame[] = ((gamesRaw ?? []) as any[]).map((g) => ({
    id: g.id,
    scheduled_at: g.scheduled_at,
    court: g.court ?? null,
    league_id: g.league_id ?? null,
    is_exhibition: g.is_exhibition ?? null,
    home: one(g.home_team),
    away: one(g.away_team),
    league: one(g.league),
    result: one(g.game_results),
  }))
  const bracketMatches: CourtsideBracketMatch[] = ((bracketRaw ?? []) as any[]).map((m) => ({
    ...m,
    team1: one(m.team1),
    team2: one(m.team2),
    bracket: one(m.bracket),
  }))
    // One day's matches — narrowing the event here is cheap and exact.
    .filter((m) => leagueIds === null || (!!m.bracket && leagueIds.includes(m.bracket.league_id)))
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Unscored first — that's what courtside is for. A captain-submitted score
  // waiting for the other captain gets its own section with a one-tap Confirm.
  // Confirmed games sink below.
  const hasScore = (g: CourtsideGame) => !!g.result && g.result.home_score !== null
  const merge = (gs: CourtsideGame[], bs: CourtsideBracketMatch[]): CourtsideItem[] =>
    [
      ...gs.map((g) => ({ kind: 'game' as const, when: g.scheduled_at, row: g })),
      ...bs.map((m) => ({ kind: 'bracket' as const, when: m.scheduled_at, row: m })),
    ].sort((x, y) => x.when.localeCompare(y.when))

  return {
    date,
    todayLocal,
    prevDate,
    nextDate,
    dayLabel: new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${date}T12:00:00Z`)),
    games,
    bracketMatches,
    unscored: merge(games.filter((g) => !hasScore(g)), bracketMatches.filter((m) => m.status !== 'completed')),
    awaiting: merge(games.filter((g) => hasScore(g) && g.result!.status === 'pending'), []),
    scored: merge(games.filter((g) => hasScore(g) && g.result!.status !== 'pending'), bracketMatches.filter((m) => m.status === 'completed')),
    dayStart,
    dayEnd,
  }
}
