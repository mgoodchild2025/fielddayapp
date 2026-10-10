// ── Scoreboard game clock + timeouts ─────────────────────────────────────────
// The web twin of ScoreboardKit's GameClock (ios/ScoreboardKit/…/GameClock.swift)
// — same JSON shape, same rules, mirrored tests. Kept beside the score events,
// not in them: Undo never touches the clock. Time comes from timestamps (when
// it started + how much had already run), never a tick counter, so a backgrounded
// tab or a reload doesn't drift it.
//
// Nothing here ends a set or the match: at 0:00 the scorekeeper is offered
// End set / End match, so "finish the point" and golden-point rules still work.

export type ClockMode = 'off' | 'stopwatch' | 'countdown'
export type ClockSide = 'A' | 'B'

export interface GameClock {
  mode: ClockMode
  /** Countdown length. */
  lengthMs: number
  /** When the clock was last started (ms since 1970). Absent/null = stopped. */
  runningSince?: number | null
  /** Time that ran before runningSince. */
  accumulatedMs: number
  timeoutLengthMs: number
  timeout?: { side: ClockSide; startedAt: number } | null
  /** Timeouts taken this set. */
  timeoutsUsed: { A: number; B: number }
  /** The game clock was running when the timeout started: resume after it. */
  resumeAfterTimeout: boolean
  /** Horn at zero (vibration always, where the device can). */
  sound: boolean
}

export const CLOCK_LENGTH_PRESETS = [10, 12, 15, 20, 25]

export const DEFAULT_CLOCK: GameClock = {
  mode: 'off',
  lengthMs: 20 * 60_000,
  runningSince: null,
  accumulatedMs: 0,
  timeoutLengthMs: 30_000,
  timeout: null,
  timeoutsUsed: { A: 0, B: 0 },
  resumeAfterTimeout: false,
  sound: false,
}

/** Tolerant read of a stored/synced clock (older boards have none). */
export function readClock(raw: unknown): GameClock {
  if (!raw || typeof raw !== 'object') return DEFAULT_CLOCK
  const c = raw as Partial<GameClock>
  return {
    ...DEFAULT_CLOCK,
    ...c,
    timeoutsUsed: { ...DEFAULT_CLOCK.timeoutsUsed, ...(c.timeoutsUsed ?? {}) },
  }
}

// ── Derived ──────────────────────────────────────────────────────────────────

export const isClockOn = (c: GameClock) => c.mode !== 'off'

export function elapsed(c: GameClock, now: number): number {
  return c.accumulatedMs + (c.runningSince != null ? Math.max(0, now - c.runningSince) : 0)
}

export const remaining = (c: GameClock, now: number) => Math.max(0, c.lengthMs - elapsed(c, now))

export const displayMs = (c: GameClock, now: number) => (c.mode === 'countdown' ? remaining(c, now) : elapsed(c, now))

export const isExpired = (c: GameClock, now: number) => c.mode === 'countdown' && elapsed(c, now) >= c.lengthMs

export const isRunning = (c: GameClock, now: number) => c.runningSince != null && !isExpired(c, now)

export function timeoutRemaining(c: GameClock, now: number): number | null {
  if (!c.timeout) return null
  return Math.max(0, c.timeoutLengthMs - (now - c.timeout.startedAt))
}

/** The next moment something should buzz (countdown zero or timeout zero). */
export function nextAlarm(c: GameClock, now: number): number | null {
  const alarms: number[] = []
  if (c.mode === 'countdown' && c.runningSince != null) {
    const at = c.runningSince + (c.lengthMs - c.accumulatedMs)
    if (at > now) alarms.push(at)
  }
  if (c.timeout) {
    const at = c.timeout.startedAt + c.timeoutLengthMs
    if (at > now) alarms.push(at)
  }
  return alarms.length ? Math.min(...alarms) : null
}

// ── Controls (each returns a new clock) ─────────────────────────────────────

export function start(c: GameClock, now: number): GameClock {
  if (!isClockOn(c) || c.runningSince != null || isExpired(c, now) || c.timeout) return c
  return { ...c, runningSince: now }
}

export function pause(c: GameClock, now: number): GameClock {
  if (c.runningSince == null) return c
  const ran = c.accumulatedMs + now - c.runningSince
  return { ...c, accumulatedMs: c.mode === 'countdown' ? Math.min(c.lengthMs, ran) : ran, runningSince: null }
}

export const toggle = (c: GameClock, now: number) =>
  c.runningSince != null && !isExpired(c, now) ? pause(c, now) : start(c, now)

/** Back to the full length (countdown) or zero (stopwatch), stopped. */
export const resetClock = (c: GameClock): GameClock => ({ ...c, runningSince: null, accumulatedMs: 0 })

export function setMode(c: GameClock, mode: ClockMode): GameClock {
  if (mode === c.mode) return c
  return { ...resetClock(c), mode, timeout: null, resumeAfterTimeout: false }
}

export const setLength = (c: GameClock, minutes: number): GameClock =>
  resetClock({ ...c, lengthMs: Math.max(1, Math.min(180, Math.round(minutes))) * 60_000 })

/** A team calls a timeout: pause a running game clock (it resumes after). */
export function startTimeout(c: GameClock, side: ClockSide, now: number): GameClock {
  if (c.timeout) return c
  const resume = isRunning(c, now)
  const paused = pause(c, now)
  return {
    ...paused,
    resumeAfterTimeout: resume,
    timeout: { side, startedAt: now },
    timeoutsUsed: { ...paused.timeoutsUsed, [side]: paused.timeoutsUsed[side] + 1 },
  }
}

export function endTimeout(c: GameClock, now: number): GameClock {
  if (!c.timeout) return c
  const ended = { ...c, timeout: null, resumeAfterTimeout: false }
  return c.resumeAfterTimeout ? start(ended, now) : ended
}

/** A set (or half) ended: the next one starts fresh. */
export function newPeriod(c: GameClock): GameClock {
  const base = c.mode === 'countdown' ? resetClock(c) : c
  return { ...base, timeout: null, resumeAfterTimeout: false, timeoutsUsed: { A: 0, B: 0 } }
}

/** The match ended: stop the clock where it is. */
export const stopClock = (c: GameClock, now: number): GameClock => ({ ...pause(c, now), timeout: null, resumeAfterTimeout: false })

/** New game: a fresh clock with the same settings. */
export const freshClock = (c: GameClock): GameClock => resetClock(newPeriod(c))

/** "12:34", "1:02:03" past an hour. A countdown rounds up (0:01 until it truly hits zero). */
export function formatClock(ms: number, roundingUp: boolean): string {
  const total = roundingUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
