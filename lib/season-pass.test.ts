import { describe, it, expect } from 'vitest'
import { seasonPassPriceCents } from './season-pass'

// The plan's worked example: 12 sessions, $120 pass, $15 drop-in.
const season = { fullPriceCents: 12000, totalSessions: 12, floorCents: 1500 }

describe('seasonPassPriceCents', () => {
  it('charges full price before the season starts', () => {
    expect(seasonPassPriceCents({ ...season, remainingSessions: 12 })).toBe(12000)
  })

  it('prorates linearly by remaining sessions', () => {
    expect(seasonPassPriceCents({ ...season, remainingSessions: 8 })).toBe(8000)  // week 5 → $80
    expect(seasonPassPriceCents({ ...season, remainingSessions: 4 })).toBe(4000)  // week 9 → $40
  })

  it('rounds up to the next dollar', () => {
    // $100 over 3 sessions, 2 left → $66.67 → $67
    expect(seasonPassPriceCents({ fullPriceCents: 10000, totalSessions: 3, remainingSessions: 2 })).toBe(6700)
  })

  it('floors at the single-session price', () => {
    // 1 of 12 left → $10 prorated, floored to the $15 drop-in price
    expect(seasonPassPriceCents({ ...season, remainingSessions: 1 })).toBe(1500)
  })

  it('never exceeds the full price (floor above full)', () => {
    expect(seasonPassPriceCents({ fullPriceCents: 1000, totalSessions: 4, remainingSessions: 2, floorCents: 2000 })).toBe(1000)
  })

  it('returns full price when no sessions are scheduled', () => {
    expect(seasonPassPriceCents({ fullPriceCents: 12000, totalSessions: 0, remainingSessions: 0 })).toBe(12000)
  })

  it('clamps out-of-range remaining counts', () => {
    expect(seasonPassPriceCents({ ...season, remainingSessions: 99 })).toBe(12000)
    expect(seasonPassPriceCents({ ...season, remainingSessions: -3 })).toBe(1500) // 0 left → floor
  })

  it('ignores a null floor', () => {
    expect(seasonPassPriceCents({ fullPriceCents: 12000, totalSessions: 12, remainingSessions: 1, floorCents: null })).toBe(1000)
  })

  it('free events stay free', () => {
    expect(seasonPassPriceCents({ fullPriceCents: 0, totalSessions: 12, remainingSessions: 6, floorCents: 1500 })).toBe(0)
  })
})
