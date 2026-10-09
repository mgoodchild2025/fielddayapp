// What a player card is still missing — the one rule every bio nudge uses
// (dashboard prompt, registration success, team "cards done", captain nudge,
// medal celebration). A card is "done" with a number, a position and a photo:
// the three things that make it recognisable on a roster or a TV.

export type CardGap = 'number' | 'position' | 'photo'

export interface CardFields {
  jerseyNumber?: string | null
  position?: string | null
  /** The card photo, or the profile avatar it falls back to. */
  photoUrl?: string | null
}

const filled = (v: string | null | undefined) => typeof v === 'string' && v.trim().length > 0

/** Missing fields, in the order the nudges list them. */
export function cardGaps(card: CardFields): CardGap[] {
  const gaps: CardGap[] = []
  if (!filled(card.jerseyNumber)) gaps.push('number')
  if (!filled(card.position)) gaps.push('position')
  if (!filled(card.photoUrl)) gaps.push('photo')
  return gaps
}

export const isCardDone = (card: CardFields) => cardGaps(card).length === 0

const PHRASE: Record<CardGap, string> = { number: 'your number', position: 'your position', photo: 'a photo' }

/** "your number", "your number and a photo", "your number, your position and a photo". */
export function describeGaps(gaps: CardGap[]): string {
  const words = gaps.map((g) => PHRASE[g])
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** Does this display config rotate player cards (a showcase zone with bios)? */
export function displayShowsBios(config: unknown): boolean {
  const zones = (config as { zones?: unknown } | null)?.zones
  if (!Array.isArray(zones)) return false
  return zones.some((z) => {
    const zone = z as { type?: string; source?: string } | null
    return zone?.type === 'showcase' && (zone.source === 'bios' || zone.source === 'both')
  })
}
