/**
 * Returns the sport-appropriate venue label for a given sport.
 * Used in schedule forms, the round-robin generator, CSV import UI,
 * and anywhere else the word "Court" would appear.
 */
export function venueLabel(sport?: string | null): string {
  switch (sport) {
    case 'hockey':
      return 'Rink'
    case 'soccer':
    case 'rugby':
      return 'Pitch'
    case 'baseball':
    case 'softball':
      return 'Diamond'
    case 'flag_football':
    case 'football':
    case 'ultimate_frisbee':
      return 'Field'
    case 'volleyball':
    case 'beach_volleyball':
    case 'basketball':
    case 'tennis':
    case 'pickleball':
    case 'badminton':
    default:
      return 'Court'
  }
}

/** Lowercase version — for use in sentences and CSV descriptions. */
export function venueLabelLower(sport?: string | null): string {
  return venueLabel(sport).toLowerCase()
}

/**
 * Format a raw court value for display in notifications.
 *
 * - If court is null/empty → returns null
 * - If court already contains letters (e.g. "Court 1", "Diamond A") → returns as-is
 * - If court is a bare number or short identifier (e.g. "1", "2") →
 *   prepends the sport-appropriate label: "Court 1", "Diamond 2", etc.
 */
export function formatCourtLabel(court: string | null | undefined, sport?: string | null): string | null {
  if (!court?.trim()) return null
  const trimmed = court.trim()
  // Already has a text prefix — return unchanged
  if (/[a-zA-Z]/.test(trimmed)) return trimmed
  // Bare identifier — prepend the venue label
  return `${venueLabel(sport)} ${trimmed}`
}
