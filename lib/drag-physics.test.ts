import { describe, expect, it } from 'vitest'
import { handoffDuration, project, releaseVelocity, rubberband, shouldDismiss } from './drag-physics'

describe('project', () => {
  it('projects a flick forward and a stop to nothing', () => {
    expect(project(0)).toBe(0)
    expect(project(1000)).toBeCloseTo(499, 0)   // 1000px/s carries ~half a screen
    expect(project(-500)).toBeCloseTo(-249.5, 0)
  })
})

describe('rubberband', () => {
  it('follows closely at first and resists more the further it goes', () => {
    const d = 400
    expect(rubberband(0, d)).toBe(0)
    const small = rubberband(20, d), big = rubberband(200, d)
    expect(small).toBeGreaterThan(10)
    expect(small).toBeLessThan(20)
    expect(big / 200).toBeLessThan(small / 20)  // proportionally less movement
    expect(rubberband(10_000, d)).toBeLessThan(d) // approaches the dimension, never past it
  })
  it('keeps direction and handles a zero dimension', () => {
    expect(rubberband(-50, 300)).toBeLessThan(0)
    expect(rubberband(50, 0)).toBe(0)
  })
})

describe('releaseVelocity', () => {
  it('measures the recent movement in px/s', () => {
    const s = [{ pos: 0, t: 0 }, { pos: 10, t: 16 }, { pos: 20, t: 32 }, { pos: 30, t: 48 }]
    expect(releaseVelocity(s)).toBeCloseTo(625, 0)
  })
  it('ignores movement older than the window (a pause before lifting = stopped)', () => {
    const s = [{ pos: 0, t: 0 }, { pos: 200, t: 50 }, { pos: 200, t: 300 }, { pos: 200, t: 316 }]
    expect(releaseVelocity(s)).toBe(0)
  })
  it('needs two samples', () => {
    expect(releaseVelocity([])).toBe(0)
    expect(releaseVelocity([{ pos: 5, t: 1 }])).toBe(0)
  })
})

describe('shouldDismiss', () => {
  const size = 500
  it('closes when dragged past half way', () => {
    expect(shouldDismiss(260, 0, size)).toBe(true)
    expect(shouldDismiss(200, 0, size)).toBe(false)
  })
  it('closes on a quick flick from a short drag', () => {
    expect(shouldDismiss(40, 1200, size)).toBe(true)
  })
  it('stays open when the finger reverses, even from far down', () => {
    expect(shouldDismiss(300, -800, size)).toBe(false)
  })
  it('never dismisses a zero-size panel', () => {
    expect(shouldDismiss(100, 1000, 0)).toBe(false)
  })
})

describe('handoffDuration', () => {
  it('is quick for fast flicks and capped for slow releases', () => {
    expect(handoffDuration(100, 3000)).toBeLessThan(handoffDuration(100, 800))
    expect(handoffDuration(300, 0)).toBe(240)
    expect(handoffDuration(10, 5000)).toBe(140)
  })
})
