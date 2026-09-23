// The dashboard's Next Session section: one upcoming session per event.
//
// A player's sessions arrive from three places — explicit session sign-ups,
// drop-in registrations tied to a session, and season passes (which cover
// every session of their event) — so the same session can appear more than
// once and several events can be in play at once. The dashboard used to keep
// only the single soonest session across everything; this keeps each event's
// soonest so the player can switch between them.

export interface SessionRow {
  id: string
  scheduled_at: string
  /** event_sessions.status — 'open' | 'cancelled'. Absent is treated as open. */
  status?: string | null
  league: { id: string } | null
}

/**
 * Each event's next session, soonest event first.
 *
 * Drops cancelled sessions (an admin-cancelled session must never read as
 * "your next session"), anything not strictly in the future, and duplicate
 * session ids from the overlapping sources. Pure; `nowIso` is passed in so
 * tests are deterministic.
 */
export function nextSessionPerEvent<T extends SessionRow>(rows: (T | null | undefined)[], nowIso: string): T[] {
  const byEvent = new Map<string, T>()
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r || !r.league?.id || !r.scheduled_at) continue
    if (r.status === 'cancelled') continue
    if (r.scheduled_at <= nowIso) continue
    if (seen.has(r.id)) continue
    seen.add(r.id)
    const current = byEvent.get(r.league.id)
    if (!current || r.scheduled_at < current.scheduled_at) byEvent.set(r.league.id, r)
  }
  return [...byEvent.values()].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
}
