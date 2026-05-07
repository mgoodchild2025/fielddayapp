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
