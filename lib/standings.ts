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
  matchesPlayed: number
  wins: number
  losses: number
  ties: number
  pointsFor: number      // for volleyball: total set-level points scored
  pointsAgainst: number  // for volleyball: total set-level points conceded
  setWins: number
  setLosses: number
}

export const VOLLEYBALL_SPORTS = new Set(['volleyball', 'beach_volleyball'])

export function isVolleyballSport(sport?: string | null): boolean {
  return VOLLEYBALL_SPORTS.has(sport ?? '')
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
