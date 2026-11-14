/**
 * Playoff format templates (flexible brackets Phase 3).
 *
 * A template turns a team count into a ready-made tier configuration —
 * including cross-tier drop-downs and per-seed byes (Phase 2 settings) — so an
 * organizer picks a format from a menu instead of composing tiers by hand.
 *
 * Built-ins are parameterized by team count and self-validate: `build()`
 * returns null when the format can't lay out cleanly at that count, and the
 * picker only offers applicable formats.
 */

import { nextPowerOf2, validateInflowBracket } from '@/lib/bracket'

/**
 * A "losers only" tier has no seeds of its own: it is filled entirely by the
 * first-round losers of the tier it receives from (everyone starts in the top
 * bracket, losers drop to a consolation bracket). It is stored as an EMPTY
 * seed range — seedTo = seedFrom − 1 — so every `seedTo − seedFrom + 1` count
 * in the generators reads 0 without a special case.
 */
export function isLosersOnlyTier(t: { seedFrom: number; seedTo: number }): boolean {
  return t.seedTo < t.seedFrom
}

/** Seeds a tier takes straight from the standings (0 for a losers-only tier). */
export function tierSeedCount(t: { seedFrom: number; seedTo: number }): number {
  return Math.max(0, t.seedTo - t.seedFrom + 1)
}

/**
 * First-round matches of a single-elim draw that produce a real loser (byes
 * don't). Same rule as `sourceLoserCount` in lib/tier-inflows.ts.
 */
export function firstRoundLosers(teams: number): number {
  if (teams < 2) return 0
  const size = nextPowerOf2(teams)
  return size / 2 - (size - teams)
}

export interface TierTemplateSpec {
  name: string
  seedFrom: number
  seedTo: number
  bracketType: 'single_elimination' | 'double_elimination' | 'all_play' | 'custom'
  thirdPlaceGame: boolean
  inflowFromTierIndex: number | null
  byeSeeds: number
}

export interface PlayoffTemplate {
  /** Stable slug for built-ins. */
  id: string
  name: string
  description: string
  build: (teamCount: number) => TierTemplateSpec[] | null
}

function isPow2(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0
}

/** Largest power of two ≤ n (0 when n < 1). */
function floorPow2(n: number): number {
  let p = 1
  while (p * 2 <= n) p *= 2
  return n >= 1 ? p : 0
}

function tier(
  name: string,
  seedFrom: number,
  seedTo: number,
  extra?: Partial<TierTemplateSpec>,
): TierTemplateSpec {
  return {
    name,
    seedFrom,
    seedTo,
    bracketType: 'single_elimination',
    thirdPlaceGame: false,
    inflowFromTierIndex: null,
    byeSeeds: 0,
    ...extra,
  }
}

/**
 * Solve the Gold + drop-down Silver shape for a team count:
 * Gold = the largest power-of-2 block of top seeds that leaves at least one
 * direct Silver seed; Silver = the rest + Gold's first-round losers, with the
 * bye count chosen so the layout validates (preferring more byes, which
 * protects the top Silver seeds — the 10-team case gives seeds 9-10 a bye to
 * the semis).
 */
function solveGoldSilverDropDown(teamCount: number): TierTemplateSpec[] | null {
  for (let gold = floorPow2(teamCount - 1); gold >= 4; gold /= 2) {
    const inflow = gold / 2 // a full power-of-2 draw: every R1 match has a loser
    const direct = teamCount - gold
    if (direct < 1) continue
    for (let byes = Math.min(direct, inflow); byes >= 0; byes--) {
      if (validateInflowBracket({ directSeeds: direct, inflowCount: inflow, byeSeeds: byes }) === null) {
        return [
          tier('Gold', 1, gold),
          tier('Silver', gold + 1, teamCount, { inflowFromTierIndex: 0, byeSeeds: byes }),
        ]
      }
    }
  }
  return null
}

/** Split a count into `parts` contiguous seed ranges, larger ranges first. */
function splitRanges(teamCount: number, parts: number): { from: number; to: number }[] {
  const base = Math.floor(teamCount / parts)
  const extra = teamCount % parts
  const ranges: { from: number; to: number }[] = []
  let cursor = 1
  for (let i = 0; i < parts; i++) {
    const size = base + (i < extra ? 1 : 0)
    ranges.push({ from: cursor, to: cursor + size - 1 })
    cursor += size
  }
  return ranges
}

export const BUILTIN_TEMPLATES: PlayoffTemplate[] = [
  {
    id: 'single-bracket',
    name: 'Single bracket',
    description: 'Everyone in one single-elimination draw. Non-power-of-2 counts give the top seeds first-round byes.',
    build: (n) => (n >= 2 ? [tier('Championship', 1, n)] : null),
  },
  {
    id: 'single-bracket-3rd',
    name: 'Single bracket + 3rd place',
    description: 'One single-elimination draw with a third-place game between the semifinal losers.',
    build: (n) => (n >= 4 ? [tier('Championship', 1, n, { thirdPlaceGame: true })] : null),
  },
  {
    id: 'gold-silver-split',
    name: 'Gold / Silver split',
    description: 'Top half and bottom half play separate single-elimination brackets. Everyone gets a second-half goal.',
    build: (n) => {
      if (n < 4) return null
      const [a, b] = splitRanges(n, 2)
      return [tier('Gold', a.from, a.to), tier('Silver', b.from, b.to)]
    },
  },
  {
    id: 'gold-silver-dropdown',
    name: 'Gold / Silver with drop-down',
    description: 'Top seeds play Gold; its first-round losers drop into Silver against the remaining seeds. Nobody is done after one loss.',
    build: (n) => (n >= 5 ? solveGoldSilverDropDown(n) : null),
  },
  {
    id: 'championship-consolation',
    name: 'Championship + Consolation',
    description: 'Every team starts in the Championship bracket. First-round losers drop into a Consolation bracket of their own.',
    build: (n) => {
      if (n < 4) return null
      const losers = firstRoundLosers(n)
      if (validateInflowBracket({ directSeeds: 0, inflowCount: losers, byeSeeds: 0 }) !== null) return null
      return [
        tier('Championship', 1, n),
        tier('Consolation', n + 1, n, { inflowFromTierIndex: 0 }),
      ]
    },
  },
  {
    id: 'gold-silver-bronze',
    name: 'Gold / Silver / Bronze split',
    description: 'Three separate single-elimination brackets by seeding third.',
    build: (n) => {
      if (n < 6) return null
      const [a, b, c] = splitRanges(n, 3)
      return [tier('Gold', a.from, a.to), tier('Silver', b.from, b.to), tier('Bronze', c.from, c.to)]
    },
  },
  {
    id: 'double-elim',
    name: 'Double elimination',
    description: 'One draw where every team must lose twice — losers drop into a losers bracket feeding the grand final.',
    build: (n) => (n >= 4 ? [tier('Championship', 1, n, { bracketType: 'double_elimination' })] : null),
  },
]

/** Built-in templates that lay out cleanly at this team count. */
export function applicableTemplates(teamCount: number): { template: PlayoffTemplate; tiers: TierTemplateSpec[] }[] {
  const out: { template: PlayoffTemplate; tiers: TierTemplateSpec[] }[] = []
  for (const t of BUILTIN_TEMPLATES) {
    const tiers = t.build(teamCount)
    if (tiers) out.push({ template: t, tiers })
  }
  return out
}

/** One-line summary of a tier layout, e.g. "Gold 1–8 · Silver 9–10 (+4 drop-downs, 2 byes)". */
export function describeTiers(tiers: TierTemplateSpec[]): string {
  return tiers
    .map((t) => {
      if (isLosersOnlyTier(t)) {
        const src = t.inflowFromTierIndex !== null ? tiers[t.inflowFromTierIndex] : undefined
        return `${t.name} (first-round losers${src ? ` of ${src.name}` : ''})`
      }
      const range = t.seedFrom === t.seedTo ? `${t.seedFrom}` : `${t.seedFrom}–${t.seedTo}`
      const bits: string[] = []
      if (t.inflowFromTierIndex !== null) bits.push('drop-downs in')
      if (t.byeSeeds > 0) bits.push(`${t.byeSeeds} bye${t.byeSeeds === 1 ? '' : 's'}`)
      if (t.bracketType === 'double_elimination') bits.push('double elim')
      if (t.bracketType === 'all_play') bits.push('all-play')
      if (t.bracketType === 'custom') bits.push('hand-built')
      if (t.thirdPlaceGame) bits.push('3rd place')
      return `${t.name} ${range}${bits.length ? ` (${bits.join(', ')})` : ''}`
    })
    .join(' · ')
}

export { isPow2 }
