/**
 * Shared session-occupancy helpers.
 *
 * Drop-in / pickup sessions accumulate registrations through TWO paths:
 *   1. `session_registrations` — the in-app "join session" button flow.
 *   2. `registrations` rows with `registration_type='drop_in'` and a `session_id`
 *      — the registration + payment flow.
 *
 * Any "spots left" / "registered count" must account for BOTH, or sessions read
 * as emptier than they are. This helper covers path (2); path (1)'s count is
 * fetched inline via `session_registrations(count)` where the sessions are read.
 */

/** Count active drop-in registrations (registrations table, session_id set) per
 *  session. Returns a map of session id → count. */
export async function countDropInRegsBySession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  leagueId: string,
  sessionIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (sessionIds.length === 0) return counts
  const { data } = await db
    .from('registrations')
    .select('session_id')
    .eq('organization_id', orgId)
    .eq('league_id', leagueId)
    .eq('registration_type', 'drop_in')
    .eq('status', 'active')
    .in('session_id', sessionIds)
  for (const r of (data ?? []) as { session_id: string | null }[]) {
    if (r.session_id) counts.set(r.session_id, (counts.get(r.session_id) ?? 0) + 1)
  }
  return counts
}
