import type { ScoringRole } from '@/lib/scoring-role'

/**
 * Where a score sheet's QR code lands (`/score/<id>`, a game or a playoff
 * bracket match): the card on Courtside for organisers, on Scorekeeping for
 * volunteer scorekeepers, and the public page for anyone else.
 * `date` is the day in the org timezone, so the day list holds it; null for a
 * playoff match not scheduled yet — it can't be on a day list, so organisers
 * get the bracket page instead.
 */
export function scoreScanTarget(
  role: ScoringRole | null,
  id: string,
  date: string | null,
  where: { publicPath: string; bracketAdminPath?: string | null },
): string {
  const q = date ? `?date=${encodeURIComponent(date)}&game=${encodeURIComponent(id)}` : ''
  if (role === 'admin') return date || !where.bracketAdminPath ? `/admin/courtside${q}` : where.bracketAdminPath
  if (role === 'scorekeeper') return `/scorekeeping${q}`
  return where.publicPath
}

/** The path printed into a score sheet's QR code. */
export const scoreScanPath = (id: string) => `/score/${id}`
