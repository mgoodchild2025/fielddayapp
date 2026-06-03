import type { DisplaySponsor } from '@/lib/display-types'

/** How many slots each tier gets in a rotation playlist (gold rotates most). */
export const TIER_WEIGHT: Record<DisplaySponsor['tier'], number> = {
  gold: 4, silver: 2, bronze: 1, standard: 1,
}

/**
 * Build a tier-weighted, evenly-interleaved rotation playlist. A gold sponsor
 * (weight 4) appears 4× as often as a standard one, spread out across the cycle
 * rather than bunched together.
 */
export function buildWeightedPlaylist<T extends { tier: DisplaySponsor['tier'] }>(sponsors: T[]): T[] {
  if (sponsors.length <= 1) return [...sponsors]
  // Assign each copy a fractional position in [0,1); sorting interleaves tiers.
  const slotted: { pos: number; item: T }[] = []
  for (const s of sponsors) {
    const w = TIER_WEIGHT[s.tier] ?? 1
    for (let k = 0; k < w; k++) slotted.push({ pos: (k + 0.5) / w, item: s })
  }
  slotted.sort((a, b) => a.pos - b.pos)
  return slotted.map((x) => x.item)
}
