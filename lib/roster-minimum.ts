/**
 * Does a team have enough players ready to meet the event's minimum team size?
 *
 * "Ready" = registered, with the waiver signed when the event has one. Coaches
 * don't count toward the minimum (they don't play); captains do. Used by the
 * captain emails (48h prep digest, 24h registration reminder).
 */

export interface RosterCounts {
  /** Registered + waiver signed (or no waiver required). Players and captains only. */
  ready: number
  /** Registered, waiver not signed yet. */
  needsWaiver: number
  /** On the roster or invited, not registered. */
  notRegistered: number
}

export type RosterVerdict =
  /** No usable minimum on the event. */
  | 'no_minimum'
  /** At or above the minimum. */
  | 'enough'
  /** Below the minimum, but signing the outstanding waivers would cover it. */
  | 'short_waivers'
  /** Below the minimum even if every registered player signs. */
  | 'short'

export interface RosterMinimum {
  minimum: number | null
  verdict: RosterVerdict
  /** How many more players must become ready (0 when enough / no minimum). */
  short: number
}

export function rosterMinimum(counts: RosterCounts, minTeamSize: number | null | undefined): RosterMinimum {
  // A minimum of 1 says nothing a captain doesn't know; treat it as unset.
  const minimum = typeof minTeamSize === 'number' && Number.isFinite(minTeamSize) && minTeamSize > 1
    ? Math.floor(minTeamSize)
    : null
  if (minimum === null) return { minimum: null, verdict: 'no_minimum', short: 0 }

  const short = Math.max(0, minimum - counts.ready)
  if (short === 0) return { minimum, verdict: 'enough', short: 0 }
  return {
    minimum,
    verdict: counts.ready + counts.needsWaiver >= minimum ? 'short_waivers' : 'short',
    short,
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
