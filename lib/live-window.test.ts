import { describe, expect, it } from 'vitest'
import { inLiveWindow } from './live-window'

const H = 60 * 60 * 1000
const start = '2026-10-03T23:00:00Z'
const t = new Date(start).getTime()

describe('inLiveWindow', () => {
  it('covers warm-ups (2h before) through a late finish (6h after)', () => {
    expect(inLiveWindow(start, t - 2 * H)).toBe(true)
    expect(inLiveWindow(start, t)).toBe(true)
    expect(inLiveWindow(start, t + 6 * H)).toBe(true)
  })
  it('is closed well before and after', () => {
    expect(inLiveWindow(start, t - 2 * H - 1)).toBe(false)
    expect(inLiveWindow(start, t + 6 * H + 1)).toBe(false)
  })
  it('is closed for missing or bad times', () => {
    expect(inLiveWindow(null, t)).toBe(false)
    expect(inLiveWindow('not a date', t)).toBe(false)
  })
})
