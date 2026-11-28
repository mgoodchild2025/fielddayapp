import { describe, expect, it } from 'vitest'
import { weekOf, attendanceStreak, streakLine } from './attendance-streak'

const TZ = 'America/Toronto'
// Wednesday 2026-11-25 20:00 Toronto
const now = Date.parse('2026-11-26T01:00:00Z')
const tue = (date: string, attended = true) => ({ at: `${date}T23:30:00Z`, attended }) // Tuesday 6:30pm Toronto

describe('weekOf', () => {
  it('Monday of the org-local week', () => {
    expect(weekOf('2026-11-26T01:00:00Z', TZ)).toBe('2026-11-23') // still Wed the 25th in Toronto
    expect(weekOf('2026-11-30T04:00:00Z', TZ)).toBe('2026-11-23') // Sunday 11pm Toronto
    expect(weekOf('2026-11-30T06:00:00Z', TZ)).toBe('2026-11-30')
  })
})

describe('attendanceStreak', () => {
  it('counts back through played weeks; a bye week does not break it', () => {
    const s = attendanceStreak([tue('2026-10-27'), tue('2026-11-03'), /* bye 11-10 */ tue('2026-11-17'), tue('2026-11-24')], now, TZ)
    expect(s).toEqual({ weeks: 4, thisWeekPlayed: true, thisWeekPending: false })
  })
  it('an RSVP "out" week breaks it', () => {
    expect(attendanceStreak([tue('2026-11-03'), tue('2026-11-10', false), tue('2026-11-17')], now, TZ).weeks).toBe(1)
  })
  it('a week with an out AND a drop-in still counts as played', () => {
    const s = attendanceStreak([tue('2026-11-10', false), { at: '2026-11-12T23:00:00Z', attended: true }, tue('2026-11-17')], now, TZ)
    expect(s.weeks).toBe(2)
  })
  it('this week still to come: streak stands, pending', () => {
    const s = attendanceStreak([tue('2026-11-03'), tue('2026-11-10'), tue('2026-11-17'), { at: '2026-11-27T23:30:00Z', attended: true }], now, TZ)
    expect(s).toEqual({ weeks: 3, thisWeekPlayed: false, thisWeekPending: true })
  })
  it('an out earlier this week does not break it yet', () => {
    const s = attendanceStreak([tue('2026-11-10'), tue('2026-11-17'), tue('2026-11-24', false)], now, TZ)
    expect(s.weeks).toBe(2)
  })
})

describe('streakLine', () => {
  const s = { weeks: 8, thisWeekPlayed: false, thisWeekPending: true }
  it('asks, then looks ahead', () => {
    expect(streakLine(s, { nextDay: 'Friday' })).toBe("You've played 8 weeks in a row 🔥 Keep it going: you in for Friday?")
    expect(streakLine(s, { nextDay: 'Friday', rsvpIn: true })).toBe("You've played 8 weeks in a row 🔥 Week 9 is Friday.")
    expect(streakLine({ ...s, thisWeekPending: false })).toBe("You've played 8 weeks in a row 🔥")
    expect(streakLine({ ...s, weeks: 2 })).toBeNull()
  })
})

describe('a streak goes stale', () => {
  it('nothing played in the last two weeks ends it', () => {
    const old = [tue('2026-09-29'), tue('2026-10-06'), tue('2026-10-13'), tue('2026-10-20')]
    expect(attendanceStreak(old, now, TZ).weeks).toBe(0)
    // last played two weeks ago (a holiday week since): still on
    expect(attendanceStreak([tue('2026-10-27'), tue('2026-11-03'), tue('2026-11-10')], now, TZ).weeks).toBe(3)
  })
})
