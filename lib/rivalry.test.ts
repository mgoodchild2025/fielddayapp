import { describe, expect, it } from 'vitest'
import { buildRivalry, rivalryRecord, isRivalry, ilikeExact, isGenericTeamName, type Meeting } from './rivalry'

const m = (at: string, outcome: Meeting['outcome'], eventId = 'e1', a: number | null = 21, b: number | null = 18): Meeting =>
  ({ at, a, b, outcome, eventId, eventName: eventId })
const year = (iso: string) => Number(iso.slice(0, 4))

describe('buildRivalry', () => {
  it('counts every meeting, across events, in date order', () => {
    const r = buildRivalry([m('2026-10-01', 'L', 'fall'), m('2025-03-01', 'W', 'spring'), m('2026-10-08', 'W', 'fall'), m('2026-10-15', 'W', 'fall')], year)
    expect([r.aWins, r.bWins, r.ties, r.meetings, r.events, r.sinceYear]).toEqual([3, 1, 0, 4, 2, 2025])
    expect(r.last?.at).toBe('2026-10-15')
    expect(r.run).toEqual({ side: 'a', count: 2 })
    expect(rivalryRecord(r)).toBe('3–1')
    expect(isRivalry(r)).toBe(true)
  })
  it('one event is not a rivalry; ties break runs', () => {
    const r = buildRivalry([m('2026-01-01', 'L'), m('2026-01-08', 'L'), m('2026-01-15', 'T')], year)
    expect(isRivalry(r)).toBe(false)
    expect(r.run).toBeNull()
    expect(rivalryRecord(r)).toBe('0–2–1')
  })
  it('empty', () => {
    expect(buildRivalry([], year)).toMatchObject({ meetings: 0, last: null, run: null, sinceYear: null })
  })
})

describe('ilikeExact', () => {
  it('escapes wildcards', () => {
    expect(ilikeExact(' 100%_Club ')).toBe('100\\%\\_Club')
  })
})

describe('isGenericTeamName', () => {
  it('placeholders are not rivals', () => {
    expect(['Team 1', 'team A', 'T3', '7', 'TBD'].every(isGenericTeamName)).toBe(true)
    expect(['Net Results', 'Team Spike', 'The 6ix'].some(isGenericTeamName)).toBe(false)
  })
})
