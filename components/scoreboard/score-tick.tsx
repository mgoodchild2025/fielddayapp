'use client'

import { useState } from 'react'

/**
 * A live score number that ticks when it changes: the new value slides up
 * into place with a brief brand-colour wash (fd-score-tick in globals.css),
 * so a glance shows *that* it moved, not just what it is. Silent on first
 * render — a page opening mid-game doesn't animate every score.
 */
export function ScoreTick({ value }: { value: number | string }) {
  const [seen, setSeen] = useState(value)
  const [tick, setTick] = useState(0)
  if (value !== seen) {
    setSeen(value)
    setTick((t) => t + 1)
  }
  // Keyed on the tick so each change remounts the span and replays the animation.
  return (
    <span key={tick} className={tick > 0 ? 'fd-score-tick' : undefined}>
      {value}
    </span>
  )
}
