/**
 * Score entry permissions — pure, tested (lib/scoring-role.test.ts).
 *
 * - 'admin': org admins (every event), and league admins on the events they
 *   are an active organizer of. They can save, forfeit, clear and replace.
 * - 'scorekeeper': a volunteer with an active `event_scorekeepers` row for the
 *   event. They save confirmed scores and forfeits (the same as an admin on
 *   game night) but can't clear a result, and get no other admin access.
 *
 * A league admin's role is org-wide in `org_members`, but their events are the
 * `league_organizers` rows — the role alone used to let an organizer of one
 * event save scores in every event of the org.
 */
export type ScoringRole = 'admin' | 'scorekeeper'

export function decideScoringRole(input: {
  orgRole: string | null
  organizerOfEvent: boolean
  scorekeeperOfEvent: boolean
  /** false for a game with no event (league_id null): org admins only. */
  hasEvent: boolean
}): ScoringRole | null {
  if (input.orgRole === 'org_admin') return 'admin'
  if (!input.hasEvent) return null
  if (input.orgRole === 'league_admin' && input.organizerOfEvent) return 'admin'
  if (input.scorekeeperOfEvent) return 'scorekeeper'
  return null
}

/** Clearing a saved result (and reversing bracket advancement) stays with admins. */
export function canClearScores(role: ScoringRole | null): boolean {
  return role === 'admin'
}
