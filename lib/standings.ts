/**
 * Shared standings logic — used by both the public event standings tab and
 * the TV display standings zone so they always show the same columns,
 * computation, and sort order.
 */

export type PtsMethod = 'wins' | 'set_wins' | 'set_differential' | 'points_for'
export type VolleyballMode = 'match_based' | 'set_based'

export interface TeamStat {
  id: string
  name: string
  /** Team identity for logo rendering; optional so callers can omit it. */
  logoUrl?: string | null
  color?: string | null
  matchesPlayed: number
  wins: number
  losses: number
  ties: number
  pointsFor: number      // for volleyball: total set-level points scored
  pointsAgainst: number  // for volleyball: total set-level points conceded
  setWins: number
  setLosses: number
  /** Trailing run like "W4" / "L2" / "T2" — set only when the run is 2+ games. */
  streak?: string | null
}

export const VOLLEYBALL_SPORTS = new Set(['volleyball', 'beach_volleyball'])

export function isVolleyballSport(sport?: string | null): boolean {
  return VOLLEYBALL_SPORTS.has(sport ?? '')
}

/** A team's accumulated stats without identity — the mutable half of TeamStat. */
export type TeamStatTotals = Omit<TeamStat, 'id' | 'name'>

export function emptyTeamStat(): TeamStatTotals {
  return {
    matchesPlayed: 0, wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0, setWins: 0, setLosses: 0,
  }
}

/** One confirmed game result, in a shape decoupled from the DB row layout. */
export interface GameResultInput {
  homeTeamId: string
  awayTeamId: string
  homeScore: number | null | undefined
  awayScore: number | null | undefined
  /** Per-set scores (volleyball). */
  sets?: { home: number; away: number }[] | null
  isForfeit?: boolean | null
  forfeitTeamId?: string | null
}

/**
 * Apply one confirmed game result to a stats accumulator for both teams,
 * auto-creating blank entries as needed. This is the single source of truth
 * for the win/loss/tie, forfeit, and set-scoring math shared by every
 * standings surface (standings tab, pool seeding, team stats, dashboard).
 *
 * Set-level stats (setWins/setLosses + set-level points) are accumulated for
 * any volleyball sport regardless of match/set-based mode — match-based
 * volleyball still needs them for the set_wins / set_differential / points_for
 * PTS methods. Callers own filtering (confirmed status, pool/active-team
 * scoping); this owns the arithmetic.
 */
export function accumulateGameResult(
  stats: Map<string, TeamStatTotals>,
  result: GameResultInput,
  isVolleyball: boolean,
): void {
  const { homeTeamId: ht, awayTeamId: at } = result
  if (!stats.has(ht)) stats.set(ht, emptyTeamStat())
  if (!stats.has(at)) stats.set(at, emptyTeamStat())
  const home = stats.get(ht)!
  const away = stats.get(at)!

  home.matchesPlayed++
  away.matchesPlayed++

  const hs = result.homeScore ?? 0
  const as_ = result.awayScore ?? 0
  // Double forfeit (flagged, no forfeiting team) = loss for both
  if (result.isForfeit && !result.forfeitTeamId) { home.losses++; away.losses++ }
  else if (hs > as_) { home.wins++; away.losses++ }
  else if (as_ > hs) { away.wins++; home.losses++ }
  else { home.ties++; away.ties++ }

  if (isVolleyball && Array.isArray(result.sets)) {
    for (const s of result.sets) {
      home.pointsFor += s.home; home.pointsAgainst += s.away
      away.pointsFor += s.away; away.pointsAgainst += s.home
      if (s.home > s.away) { home.setWins++; away.setLosses++ }
      else if (s.away > s.home) { away.setWins++; home.setLosses++ }
    }
  } else {
    home.pointsFor += hs; home.pointsAgainst += as_
    away.pointsFor += as_; away.pointsAgainst += hs
  }
}

export function computePts(team: TeamStat, method: PtsMethod): number {
  switch (method) {
    case 'wins':             return team.wins
    case 'set_wins':         return team.setWins
    case 'set_differential': return team.setWins - team.setLosses
    case 'points_for':       return team.pointsFor
  }
}

// Safe set ratio: if SL is 0, use SW as ratio (unbeaten in sets → highest ratio)
function setRatio(team: TeamStat): number {
  return team.setLosses === 0 ? team.setWins : team.setWins / team.setLosses
}

export function sortMatchBased<T extends TeamStat>(teams: T[], method: PtsMethod): T[] {
  return [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    const ptsDiff = computePts(b, method) - computePts(a, method)
    if (ptsDiff !== 0) return ptsDiff
    const ratioDiff = setRatio(b) - setRatio(a)
    if (ratioDiff !== 0) return ratioDiff
    return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
  })
}

export function sortSetBased<T extends TeamStat>(teams: T[]): T[] {
  return [...teams].sort((a, b) => {
    if (b.setWins !== a.setWins) return b.setWins - a.setWins
    const sdDiff = (b.setWins - b.setLosses) - (a.setWins - a.setLosses)
    if (sdDiff !== 0) return sdDiff
    return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
  })
}

/** A column descriptor for rendering a standings table. */
export interface StandingsColumn {
  key: string
  label: string
  /** Value for a given team row (rank is passed for the RANK column). */
  value: (team: TeamStat, rank: number) => string | number
  /** Highlight column (e.g. the primary sorting stat). */
  emphasis?: boolean
}

/**
 * Returns the ordered columns for a standings table, matching the public
 * event standings tab exactly:
 *   - volleyball + set_based  → MP, SW, SL, SPF, SPA, PD
 *   - volleyball + match_based → MP, W, L, SW, SL, PF, PA, PD, PTS
 *   - non-volleyball          → MP, W, L, PF, PA, PD
 */
export function getStandingsColumns(
  sport: string | null | undefined,
  mode: VolleyballMode,
  method: PtsMethod,
): StandingsColumn[] {
  const isVb = isVolleyballSport(sport)
  const pd = (t: TeamStat) => {
    const d = t.pointsFor - t.pointsAgainst
    return `${d > 0 ? '+' : ''}${d}`
  }

  if (isVb && mode === 'set_based') {
    return [
      { key: 'mp',  label: 'MP',  value: (t) => t.matchesPlayed },
      { key: 'sw',  label: 'SW',  value: (t) => t.setWins, emphasis: true },
      { key: 'sl',  label: 'SL',  value: (t) => t.setLosses },
      { key: 'spf', label: 'SPF', value: (t) => t.pointsFor },
      { key: 'spa', label: 'SPA', value: (t) => t.pointsAgainst },
      { key: 'pd',  label: 'PD',  value: pd },
    ]
  }

  if (isVb) {
    return [
      { key: 'mp',  label: 'MP',  value: (t) => t.matchesPlayed },
      { key: 'w',   label: 'W',   value: (t) => t.wins, emphasis: true },
      { key: 'l',   label: 'L',   value: (t) => t.losses },
      { key: 'sw',  label: 'SW',  value: (t) => t.setWins },
      { key: 'sl',  label: 'SL',  value: (t) => t.setLosses },
      { key: 'pf',  label: 'PF',  value: (t) => t.pointsFor },
      { key: 'pa',  label: 'PA',  value: (t) => t.pointsAgainst },
      { key: 'pd',  label: 'PD',  value: pd },
      { key: 'pts', label: 'PTS', value: (t) => computePts(t, method), emphasis: true },
    ]
  }

  // Non-volleyball
  return [
    { key: 'mp', label: 'MP', value: (t) => t.matchesPlayed },
    { key: 'w',  label: 'W',  value: (t) => t.wins, emphasis: true },
    { key: 'l',  label: 'L',  value: (t) => t.losses },
    { key: 'pf', label: 'PF', value: (t) => t.pointsFor },
    { key: 'pa', label: 'PA', value: (t) => t.pointsAgainst },
    { key: 'pd', label: 'PD', value: pd },
  ]
}

/** Sort teams using the configured method/mode. */
export function sortStandings<T extends TeamStat>(
  teams: T[],
  sport: string | null | undefined,
  mode: VolleyballMode,
  method: PtsMethod,
): T[] {
  return isVolleyballSport(sport) && mode === 'set_based'
    ? sortSetBased(teams)
    : sortMatchBased(teams, method)
}

/** One game's outcome per team, matching accumulateGameResult's W/L/T rules. */
type StreakGame = {
  homeTeamId: string
  awayTeamId: string
  homeScore: number | null | undefined
  awayScore: number | null | undefined
  isForfeit?: boolean | null
  forfeitTeamId?: string | null
  scheduledAt: string
}

/**
 * Trailing result run per team ("W4", "L2", "T2") from confirmed games.
 * Chronological by scheduledAt; runs shorter than 2 return nothing — a "W1"
 * chip is noise. W/L/T per game follows the same rules as the standings math.
 */
export function computeStreaks(games: StreakGame[]): Map<string, string> {
  const byTeam = new Map<string, string[]>()
  const push = (teamId: string, r: string) => {
    const list = byTeam.get(teamId) ?? []
    list.push(r)
    byTeam.set(teamId, list)
  }
  for (const g of [...games].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
    const hs = g.homeScore ?? 0
    const as_ = g.awayScore ?? 0
    if (g.isForfeit && !g.forfeitTeamId) { push(g.homeTeamId, 'L'); push(g.awayTeamId, 'L') }
    else if (hs > as_) { push(g.homeTeamId, 'W'); push(g.awayTeamId, 'L') }
    else if (as_ > hs) { push(g.awayTeamId, 'W'); push(g.homeTeamId, 'L') }
    else { push(g.homeTeamId, 'T'); push(g.awayTeamId, 'T') }
  }
  const streaks = new Map<string, string>()
  for (const [teamId, results] of byTeam) {
    const last = results[results.length - 1]
    let count = 0
    for (let i = results.length - 1; i >= 0 && results[i] === last; i--) count++
    if (count >= 2) streaks.set(teamId, `${last}${count}`)
  }
  return streaks
}
