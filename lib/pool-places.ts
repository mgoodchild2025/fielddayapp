/**
 * "Pool places" playoff seeding: every pool winner, then every runner-up,
 * then every third place, … — and within one place, the better record first.
 *
 * That single ordering answers "top 2 from each pool plus the best 2 third
 * places": with 3 pools and an 8-team Gold bracket, seeds 1–3 are the pool
 * winners, 4–6 the runners-up, and 7–8 the two best third places (the
 * wildcards); Silver takes the next slice (9–12). Pure (tested); the seeding
 * action supplies the per-pool standings and the record comparison.
 */

import { seedFromStandings, type StandingsSortMethod, type TeamStanding } from './bracket'

export interface PlacedTeam<T> {
  team: T
  /** 1 = pool winner. */
  place: number
  /** Index of the pool the team came from. */
  poolIndex: number
}

/**
 * @param pools each pool's teams, best first
 * @param rankGroup orders teams that share a place, best first (the
 *   standings tiebreakers; by win % when pools played different numbers of games)
 */
export function orderByPoolPlace<T>(
  pools: T[][],
  rankGroup: (teams: T[]) => T[],
  /** Identifies a team when rankGroup returns copies (seedFromStandings does). */
  keyOf: (team: T) => unknown = (t) => t,
): PlacedTeam<T>[] {
  const out: PlacedTeam<T>[] = []
  const deepest = Math.max(0, ...pools.map((p) => p.length))
  for (let p = 0; p < deepest; p++) {
    const group: PlacedTeam<T>[] = []
    pools.forEach((pool, poolIndex) => { if (p < pool.length) group.push({ team: pool[p], place: p + 1, poolIndex }) })
    const ranked = rankGroup(group.map((g) => g.team))
    // Map back by key so the comparison only has to know about teams
    for (const t of ranked) {
      const at = group.findIndex((g) => keyOf(g.team) === keyOf(t))
      if (at >= 0) out.push(group.splice(at, 1)[0])
    }
    out.push(...group) // anything rankGroup dropped keeps its pool order
  }
  return out
}

/**
 * Avoid first-round rematches from the same pool where it costs nothing:
 * when a first-round pair comes from one pool, swap the LOWER seed with
 * another team of the same place (so no one gains or loses a level) if that
 * clears the clash without creating another. Seeds are positions in `order`
 * (1-based); `pairings` are the bracket's first-round seed pairs — pairs that
 * name a seed past the end (byes) are ignored.
 */
export function separateFirstRoundPools<T>(order: PlacedTeam<T>[], pairings: [number, number][]): PlacedTeam<T>[] {
  const o = [...order]
  const n = o.length
  const live = pairings.filter(([a, b]) => a <= n && b <= n)
  const opponentOf = (seed: number): number | null => {
    for (const [a, b] of live) { if (a === seed) return b; if (b === seed) return a }
    return null
  }
  const clashes = (seed: number): boolean => {
    const opp = opponentOf(seed)
    return opp !== null && o[opp - 1].poolIndex === o[seed - 1].poolIndex
  }
  for (const [a, b] of live) {
    if (o[a - 1].poolIndex !== o[b - 1].poolIndex) continue
    const low = Math.max(a, b)
    // Try the other teams of the same place, nearest seed first
    const candidates = o
      .map((e, i) => ({ e, seed: i + 1 }))
      .filter(({ e, seed }) => seed !== low && e.place === o[low - 1].place)
      .sort((x, y) => Math.abs(x.seed - low) - Math.abs(y.seed - low))
    for (const { seed } of candidates) {
      ;[o[low - 1], o[seed - 1]] = [o[seed - 1], o[low - 1]]
      if (!clashes(low) && !clashes(seed)) break
      ;[o[low - 1], o[seed - 1]] = [o[seed - 1], o[low - 1]] // undo, try next
    }
  }
  return o
}

/**
 * What each tier will get, in words, for the wizard: "3 pool winners, 3
 * runners-up and the best 2 of 3 third places". `poolSizes` are team counts
 * per pool; tiers are 1-based inclusive seed ranges.
 */
export function describePlaceTiers(poolSizes: number[], tiers: { name: string; seedFrom: number; seedTo: number }[]): string[] {
  const places: number[] = [] // place of each overall seed position
  const deepest = Math.max(0, ...poolSizes)
  for (let p = 1; p <= deepest; p++) for (const size of poolSizes) if (p <= size) places.push(p)
  const word = (p: number, plural: boolean) =>
    p === 1 ? (plural ? 'pool winners' : 'pool winner')
    : p === 2 ? (plural ? 'runners-up' : 'runner-up')
    : `${ordinalWord(p)} place${plural ? 's' : ''}`
  return tiers.map((t) => {
    if (t.seedTo < t.seedFrom) return `${t.name}: filled by drop-downs`
    const slice = places.slice(t.seedFrom - 1, t.seedTo)
    const bits: string[] = []
    for (const p of [...new Set(slice)]) {
      const got = slice.filter((x) => x === p).length
      const ofPlace = places.filter((x) => x === p).length
      if (got === ofPlace) bits.push(`${got === 1 ? 'the' : `all ${got}`} ${word(p, got !== 1)}`)
      else {
        const firstIdx = places.indexOf(p)
        const startsAtTop = t.seedFrom - 1 <= firstIdx
        bits.push(startsAtTop
          ? `the best ${got} of ${ofPlace} ${word(p, true)}`
          : got === 1 ? `the remaining ${word(p, false)}` : `the other ${got} ${word(p, true)}`)
      }
    }
    const short = slice.length < t.seedTo - t.seedFrom + 1 ? ` (only ${slice.length} teams left)` : ''
    return `${t.name}: ${joinWords(bits)}${short}`
  })
}

function ordinalWord(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

function joinWords(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? 'nobody'
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

// ── With real standings ──────────────────────────────────────────────────────


/**
 * Ranks teams that share a pool place: the standings tiebreakers, but by win %
 * first when they played different numbers of games (a 5-team pool's third
 * place has had more chances to win than a 4-team pool's).
 */
export function rankPlaceGroup(
  group: TeamStanding[],
  ptsMethod: StandingsSortMethod = 'wins',
  volleyballMode: 'match_based' | 'set_based' = 'match_based',
): TeamStanding[] {
  const base = seedFromStandings(group, group.length, ptsMethod, volleyballMode)
  const played = (t: TeamStanding) => t.wins + t.losses + t.ties
  if (new Set(base.map(played)).size <= 1) return base
  const pct = (t: TeamStanding) => (played(t) > 0 ? (t.wins + t.ties / 2) / played(t) : 0)
  return [...base].sort((a, b) => pct(b) - pct(a)) // stable: ties keep the tiebreaker order
}

/** Each pool's teams (unsorted) → the whole field in pool-places order. */
export function orderPoolStandingsByPlace(
  pools: TeamStanding[][],
  ptsMethod: StandingsSortMethod = 'wins',
  volleyballMode: 'match_based' | 'set_based' = 'match_based',
): PlacedTeam<TeamStanding>[] {
  const sorted = pools.map((p) => seedFromStandings(p, p.length, ptsMethod, volleyballMode))
  return orderByPoolPlace(sorted, (g) => rankPlaceGroup(g, ptsMethod, volleyballMode), (t) => t.teamId)
}
