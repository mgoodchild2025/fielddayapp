/**
 * Championship-banner felt tints, shared by the Hall page, the TV showcase and
 * the OG card so a banner is the same colour everywhere.
 *
 * A team that set its own colour gets a banner in that colour — the most
 * recognisable thing we can hang. Otherwise the tint is keyed to the banner
 * itself (team + year), not list position, so it survives reordering and
 * shuffle. On a wall, `assignBannerTints` additionally keeps two fallback
 * banners side by side from landing on the same tint.
 */

export const BANNER_TINTS = ['var(--brand-primary)', '#24406e', '#8c2f2b', '#2c5a41', '#5b3a6e']

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function hashIndex(teamName: string, year: string): number {
  const key = `${teamName.toLowerCase()}|${year}`
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return hash % BANNER_TINTS.length
}

/** One banner in isolation (TV slide, OG card): team colour, else keyed palette tint. */
export function bannerTint(teamName: string, year: string, teamColor?: string | null): string {
  if (teamColor && HEX.test(teamColor)) return teamColor
  return BANNER_TINTS[hashIndex(teamName, year)]
}

/**
 * Tints for a row of banners. Team colours are used as-is; palette fallbacks
 * step to the next tint when they would repeat their left-hand neighbour.
 */
export function assignBannerTints(banners: { teamName: string; year: string; color?: string | null }[]): string[] {
  const out: string[] = []
  for (const b of banners) {
    const prev = out[out.length - 1]
    if (b.color && HEX.test(b.color)) { out.push(b.color); continue }
    let idx = hashIndex(b.teamName, b.year)
    if (BANNER_TINTS[idx] === prev) idx = (idx + 1) % BANNER_TINTS.length
    out.push(BANNER_TINTS[idx])
  }
  return out
}
