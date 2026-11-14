import { describe, expect, it } from 'vitest'
import { courtKey, listCourts, matchesSearch, planCourt, readCourtCookie } from './courtside-order'

const at = (hhmm: string) => `2026-11-21T${hhmm}:00.000Z`
const g = (id: string, hhmm: string, court: string | null = 'Court 1', teams: [string, string] = ['Hawks', 'Owls']) =>
  ({ id, when: at(hhmm), court, teams })

describe('courts', () => {
  it('treats spacing and capitals as the same court, sorts naturally, no-court last', () => {
    expect(courtKey('  Court   3 ')).toBe('court 3')
    expect(courtKey(null)).toBe('')
    expect(listCourts([{ court: 'Court 10' }, { court: null }, { court: 'Court 2' }, { court: 'court 2 ' }, { court: 'Court 1' }]))
      .toEqual([
        { key: 'court 1', label: 'Court 1' },
        { key: 'court 2', label: 'Court 2' },
        { key: 'court 10', label: 'Court 10' },
        { key: '', label: 'No court' },
      ])
  })
})

describe('matchesSearch', () => {
  it('matches every typed word against both teams and the court', () => {
    const item = g('a', '10:00', 'Court 3', ['Spike Force', 'Net Ninjas'])
    expect(matchesSearch(item, 'spike')).toBe(true)
    expect(matchesSearch(item, 'ninjas court 3')).toBe(true)
    expect(matchesSearch(item, 'hawks')).toBe(false)
    expect(matchesSearch(item, '   ')).toBe(true)
  })
})

describe('planCourt', () => {
  const day = [g('a', '09:00'), g('b', '10:00'), g('c', '11:00'), g('d', '12:00')]

  it('before play starts: no game on now, the first is next', () => {
    const p = planCourt(day, new Date(at('08:00')).getTime())
    expect(p.now).toBeNull()
    expect(p.next?.id).toBe('a')
    expect(p.later.map((x) => x.id)).toEqual(['b', 'c', 'd'])
    expect(p.missed).toEqual([])
  })

  it('mid-day: the latest started game is on now, earlier unscored ones are missed', () => {
    const p = planCourt(day, new Date(at('10:30')).getTime())
    expect(p.now?.id).toBe('b')
    expect(p.missed.map((x) => x.id)).toEqual(['a'])
    expect(p.next?.id).toBe('c')
    expect(p.later.map((x) => x.id)).toEqual(['d'])
  })

  it('counts a game as on now a few minutes before its start', () => {
    expect(planCourt(day, new Date(at('10:56')).getTime()).now?.id).toBe('c')
    expect(planCourt(day, new Date(at('10:50')).getTime()).now?.id).toBe('b')
  })

  it('after the last start: last game is on now, nothing next', () => {
    const p = planCourt(day, new Date(at('18:00')).getTime())
    expect(p.now?.id).toBe('d')
    expect(p.next).toBeNull()
    expect(p.missed.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by start time whatever order it is given', () => {
    const p = planCourt([day[2], day[0], day[1]], new Date(at('09:30')).getTime())
    expect(p.now?.id).toBe('a')
    expect(p.next?.id).toBe('b')
  })
})

describe('readCourtCookie', () => {
  it('returns the court only for the same day', () => {
    expect(readCourtCookie(encodeURIComponent('2026-11-21|Court 3'), '2026-11-21')).toBe('court 3')
    expect(readCourtCookie('2026-11-20|Court 3', '2026-11-21')).toBeNull()
    expect(readCourtCookie('2026-11-21|', '2026-11-21')).toBe('')
    expect(readCourtCookie(undefined, '2026-11-21')).toBeNull()
    expect(readCourtCookie('garbage', '2026-11-21')).toBeNull()
  })
})
