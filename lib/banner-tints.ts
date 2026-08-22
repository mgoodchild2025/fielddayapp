/**
 * Championship-banner felt tints, shared by the Hall page and the TV showcase
 * so a banner is the same colour everywhere. Brand primary leads; the tint is
 * keyed to the banner itself (team + year), not list position, so it survives
 * reordering and shuffle.
 */

export const BANNER_TINTS = ['var(--brand-primary)', '#24406e', '#8c2f2b', '#2c5a41', '#5b3a6e']

export function bannerTint(teamName: string, year: string): string {
  const key = `${teamName.toLowerCase()}|${year}`
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return BANNER_TINTS[hash % BANNER_TINTS.length]
}
