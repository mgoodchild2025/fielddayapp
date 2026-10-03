/**
 * Whether a game is close enough to its start time that a scoreboard could be
 * broadcasting it. Schedule rows mount a live badge (and with it the Supabase
 * client + a Realtime channel) only inside this window, so a season's worth of
 * past and future rows doesn't open a socket on every page view.
 *
 * Generous on purpose: scorekeepers start boards during warm-ups, and nights
 * run late.
 */
export const LIVE_WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000
export const LIVE_WINDOW_AFTER_MS = 6 * 60 * 60 * 1000

export function inLiveWindow(scheduledAt: string | null | undefined, now: number): boolean {
  if (!scheduledAt) return false
  const t = new Date(scheduledAt).getTime()
  if (Number.isNaN(t)) return false
  return t - LIVE_WINDOW_BEFORE_MS <= now && now <= t + LIVE_WINDOW_AFTER_MS
}

/** inLiveWindow against the current time (server render). */
export function inLiveWindowNow(scheduledAt: string | null | undefined): boolean {
  return inLiveWindow(scheduledAt, Date.now())
}
