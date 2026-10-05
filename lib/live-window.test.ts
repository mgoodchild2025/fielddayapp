import { describe, expect, it } from 'vitest'
import { inLiveWindow, mayGoLiveSoon } from './live-window'

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

describe('mayGoLiveSoon', () => {
  const at = '2026-10-05T23:00:00Z'
  const t = new Date(at).getTime()
  it('includes games starting within a day (a page opened in the afternoon)', () => {
    expect(mayGoLiveSoon(at, t - 5 * 3600_000)).toBe(true)
  })
  it('excludes games more than a day out or long finished', () => {
    expect(mayGoLiveSoon(at, t - 25 * 3600_000)).toBe(false)
    expect(mayGoLiveSoon(at, t + 7 * 3600_000)).toBe(false)
  })
  it('handles missing or bad times', () => {
    expect(mayGoLiveSoon(null)).toBe(false)
    expect(mayGoLiveSoon('nope')).toBe(false)
  })
})
