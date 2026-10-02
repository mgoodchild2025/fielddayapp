/**
 * Gesture maths for direct-manipulation UI (drag-to-dismiss sheets and
 * drawers, the scoreboard swipe). Pure, so it's tested; the DOM wiring lives
 * in components/ui/use-drag-dismiss.ts.
 *
 * Formulas follow Apple's "Designing Fluid Interfaces": project where a flick
 * is *going* (exponential decay, like scroll deceleration) and decide from
 * that, rather than from where the finger happened to lift; resist past a
 * boundary progressively instead of stopping hard.
 */

/** Distance (px) a release at `velocity` (px/s) would carry before stopping. */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/**
 * Rubber-band past a boundary: the further the drag goes, the less the
 * element follows — it slows before it stops, never hits a wall.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0
  const sign = overshoot < 0 ? -1 : 1
  const o = Math.abs(overshoot)
  return sign * ((o * dimension * constant) / (dimension + constant * o))
}

export interface Sample {
  /** Position along the dismiss axis (px). */
  pos: number
  /** Timestamp (ms). */
  t: number
}

/**
 * Release velocity (px/s) from the recent movement history — the last
 * `windowMs` only, so a pause before lifting reads as "stopped", not as the
 * speed of the drag a second ago.
 */
export function releaseVelocity(samples: Sample[], windowMs = 80): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = samples[samples.length - 2]
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break
    first = samples[i]
  }
  const dt = last.t - first.t
  if (dt <= 0) return 0
  return ((last.pos - first.pos) / dt) * 1000
}

/**
 * Should a sheet/drawer dragged `offset` px along its dismiss axis (positive
 * = toward closing) dismiss on release? Project the momentum forward and pick
 * the nearer resting point: open (0) or closed (`size`).
 */
export function shouldDismiss(offset: number, velocity: number, size: number): boolean {
  if (size <= 0) return false
  const resting = offset + project(velocity)
  return resting > size / 2
}

/**
 * Duration (ms) for the hand-off animation so it leaves the finger at about
 * the speed the finger was moving, clamped to keep the UI snappy.
 */
export function handoffDuration(remaining: number, velocity: number, min = 140, max = 240): number {
  const v = Math.abs(velocity)
  if (v < 1) return max
  // The ease-out curves used here start ~2.5x faster than linear.
  const ms = (Math.abs(remaining) / v) * 1000 * 2.5
  return Math.round(Math.min(max, Math.max(min, ms)))
}
