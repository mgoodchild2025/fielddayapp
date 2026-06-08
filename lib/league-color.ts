/**
 * Deterministic 8-color palette assignment for leagues.
 * Returns a stable hex color for any given league ID.
 * Shared by the admin calendar and player-facing calendar views.
 */

const PALETTE_HEX = [
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#10b981', // emerald-500
  '#f43f5e', // rose-500
  '#f59e0b', // amber-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
]

const PALETTE_LIGHT = [
  '#dbeafe', // blue-100
  '#ede9fe', // violet-100
  '#d1fae5', // emerald-100
  '#ffe4e6', // rose-100
  '#fef3c7', // amber-100
  '#cffafe', // cyan-100
  '#fce7f3', // pink-100
  '#ccfbf1', // teal-100
]

function hashIndex(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return hash % PALETTE_HEX.length
}

/** Returns a saturated hex color for this league ID */
export function leagueColor(id: string): string {
  return PALETTE_HEX[hashIndex(id)]
}

/** Returns a light/pastel hex color for this league ID */
export function leagueColorLight(id: string): string {
  return PALETTE_LIGHT[hashIndex(id)]
}
