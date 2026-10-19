/**
 * Door Alert rules that don't need a database (tested in logic.test.ts).
 */

/** Unacknowledged rings re-notify at these ages, then stop. */
export const RENOTIFY_AT_MS = [60_000, 120_000] as const

/**
 * Rings older than this stop alerting even if nobody acknowledged them: the
 * visitor has given up or been let in by someone without a display. They stay
 * in the ring log.
 */
export const LIVE_RING_MAX_AGE_MS = 15 * 60_000

/**
 * An unanswered alert flashes and chimes this long, then quiets to a calm
 * "not answered" card: often someone saw the screen and let the visitor in
 * without crossing the gym to tap ON MY WAY. A new ring is loud again.
 */
export const QUIET_AFTER_MS = 2 * 60_000

/** True once the NEWEST ring has gone unanswered for QUIET_AFTER_MS. */
export function isQuietAlert(newestRingCreatedAt: string, nowMs: number): boolean {
  return nowMs - Date.parse(newestRingCreatedAt) >= QUIET_AFTER_MS
}

/** The visitor page polls for an acknowledgement this long, then stops. */
export const VISITOR_POLL_MS = 3 * 60_000

/**
 * The re-notify stage that is due now (1 = 60 s, 2 = 120 s), or null.
 * When both are overdue (server restarted mid-ring) it returns the last one:
 * one catch-up push, not two in a row.
 */
export function dueRenotifyStage(createdAtMs: number, sentStages: number, nowMs: number): 1 | 2 | null {
  const age = nowMs - createdAtMs
  let due: 1 | 2 | null = null
  RENOTIFY_AT_MS.forEach((at, i) => {
    if (age >= at) due = (i + 1) as 1 | 2
  })
  if (due === null || due <= sentStages) return null
  return due
}

export function isLiveRing(ring: { created_at: string; acknowledged_at: string | null }, nowMs: number): boolean {
  return ring.acknowledged_at === null && nowMs - Date.parse(ring.created_at) < LIVE_RING_MAX_AGE_MS
}

export type RingReason = 'not_found' | 'disarmed' | 'cooldown' | 'station_limit'

/** What door_try_ring's refusal means to the visitor's browser. */
export function ringRefusal(
  reason: RingReason,
  retryAfter: number,
  fallbackMessage: string | null,
): { status: number; body: Record<string, unknown> } {
  switch (reason) {
    case 'disarmed':
      return { status: 409, body: { error: 'disarmed', fallbackMessage: fallbackMessage ?? null } }
    case 'cooldown':
    case 'station_limit':
      return { status: 429, body: { error: reason, retryAfter: Math.max(1, retryAfter) } }
    default:
      return { status: 404, body: { error: 'not_found' } }
  }
}

/** "2 people at the door" etc. — newest first is the caller's job. */
export function alertHeadline(names: (string | null)[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0] ? `${names[0]} is at the door` : 'Someone is at the door'
  return `${names.length} people at the door`
}
