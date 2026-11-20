import type { ScoringRole } from '@/lib/scoring-role'

/**
 * Where a score sheet's QR code lands (`/score/<gameId>`): the game's card on
 * Courtside for organisers, on Scorekeeping for volunteer scorekeepers, and
 * the public game page for anyone else (a captain, a curious player).
 * `date` is the game's day in the org timezone, so the day list holds it.
 */
export function scoreScanTarget(role: ScoringRole | null, gameId: string, date: string): string {
  const q = `?date=${encodeURIComponent(date)}&game=${encodeURIComponent(gameId)}`
  if (role === 'admin') return `/admin/courtside${q}`
  if (role === 'scorekeeper') return `/scorekeeping${q}`
  return `/games/${encodeURIComponent(gameId)}`
}

/** The path printed into a score sheet's QR code. */
export const scoreScanPath = (gameId: string) => `/score/${gameId}`
