import { GF_ROUND, LB_ROUND_BASE } from '@/lib/bracket'

/**
 * Printed playoff score cards: the colours that make tier and stage readable
 * across a gym, and the faint hints printed in empty team slots (the cards
 * usually go to print before the bracket is seeded). Pure — tested.
 *
 * All fills are dark enough for white text, and stay distinct in greyscale
 * by their wording, not their colour alone.
 */

const TIER_KEYWORDS: [RegExp, string][] = [
  [/\bgold|champ/i, '#a16207'],
  [/\bsilver/i, '#475569'],
  [/\bbronze/i, '#9a3412'],
  [/\bplatinum|diamond/i, '#0f766e'],
]
const TIER_PALETTE = ['#1d4ed8', '#15803d', '#7e22ce', '#be185d', '#0e7490']

/** A tier's colour: from its name (Gold, Silver, Bronze…), else by its place in the list. */
export function tierColor(name: string, sortOrder = 0): string {
  for (const [re, c] of TIER_KEYWORDS) if (re.test(name)) return c
  return TIER_PALETTE[Math.abs(sortOrder) % TIER_PALETTE.length]
}

/** A stage's colour. Rounds count down: round 1 = final, 2 = semis, 4 = quarters. */
export function stageColor(roundNumber: number, matchNumber?: number): string {
  if (roundNumber >= GF_ROUND) return '#b91c1c'
  if (roundNumber >= LB_ROUND_BASE) return '#c2410c'
  if (roundNumber === 1) return matchNumber === 2 ? '#78350f' : '#b91c1c'
  if (roundNumber === 2) return '#6d28d9'
  if (roundNumber <= 4) return '#1d4ed8'
  return '#0f766e'
}

/** "Quarter-Finals" → "QF"; names it doesn't know stay as they are. */
export function stageShort(stage: string): string {
  const s = stage.trim()
  if (/^quarter/i.test(s)) return 'QF'
  if (/^semi/i.test(s)) return 'SF'
  if (/^lb semi/i.test(s)) return 'LB SF'
  return s
}

/** One route into a slot: the match it comes from, and whether the winner or loser comes. */
export interface FeedSource {
  outcome: 'winner' | 'loser'
  stage: string
  matchNumber: number
  /** Set when the source is in another bracket (a drop-down from Gold). */
  bracketName?: string | null
}

/**
 * The faint reminder printed under an empty team line: what the scaffold
 * calls the slot ("Seed 3", "Pool winner #1") and/or where the team comes
 * from ("Winner of QF Match 2"). Null when there is nothing to say.
 */
export function slotHint(opts: { seed: number | null; label: string | null; feed: FeedSource | null }): string | null {
  // One source, most specific first: the scaffold's own label (it already
  // says "Loser of Gold Quarter-Finals M2" on drop-down slots), the seed, then
  // the route into the slot.
  const label = opts.label?.trim() || null
  if (label && !/^tbd$/i.test(label)) return label
  if (opts.seed !== null) return `Seed ${opts.seed}`
  if (opts.feed) {
    const from = [opts.feed.bracketName, stageShort(opts.feed.stage)].filter(Boolean).join(' ')
    return `${opts.feed.outcome === 'winner' ? 'Winner' : 'Loser'} of ${from} Match ${opts.feed.matchNumber}`
  }
  return null
}
