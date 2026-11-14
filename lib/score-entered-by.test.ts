import { describe, expect, it } from 'vitest'
import { gameEnteredBy, matchEnteredBy, scorerDisplayName } from './score-entered-by'

const tz = 'America/Toronto'
const names = new Map([['u1', 'Sam Lee'], ['u2', 'Ana Ruiz']])
const t = '2026-11-21T15:42:00.000Z' // 10:42 AM Toronto

describe('gameEnteredBy', () => {
  it('admin or scorekeeper save: entered by them', () => {
    expect(gameEnteredBy({ status: 'confirmed', submitted_by: 'u1', confirmed_by: 'u1', confirmed_at: t }, names, tz))
      .toBe('Entered by Sam Lee · 10:42 a.m.')
  })

  it('captain submitted, someone else confirmed: both named', () => {
    expect(gameEnteredBy({ status: 'confirmed', submitted_by: 'u1', confirmed_by: 'u2', confirmed_at: t }, names, tz))
      .toBe('Submitted by Sam Lee, confirmed by Ana Ruiz · 10:42 a.m.')
  })

  it('pending: who submitted it', () => {
    expect(gameEnteredBy({ status: 'pending', submitted_by: 'u2', submitted_at: t }, names, tz))
      .toBe('Submitted by Ana Ruiz · 10:42 a.m.')
  })

  it('nothing known: nothing shown', () => {
    expect(gameEnteredBy(null, names, tz)).toBeNull()
    expect(gameEnteredBy({ status: 'confirmed', submitted_by: 'gone' }, names, tz)).toBeNull()
    expect(gameEnteredBy({ status: 'confirmed', confirmed_by: 'u1' }, names, tz)).toBe('Entered by Sam Lee')
  })
})

describe('matchEnteredBy', () => {
  it('names the scorer of a playoff match', () => {
    expect(matchEnteredBy({ scored_by: 'u2', scored_at: t }, names, tz)).toBe('Entered by Ana Ruiz · 10:42 a.m.')
    expect(matchEnteredBy({ scored_by: null }, names, tz)).toBeNull()
  })
})

describe('scorerDisplayName', () => {
  it('prefers the name, never shows a full email', () => {
    expect(scorerDisplayName({ full_name: ' Sam Lee ', email: 'sam@x.com' })).toBe('Sam Lee')
    expect(scorerDisplayName({ full_name: '', email: 'sam.lee@x.com' })).toBe('sam.lee')
    expect(scorerDisplayName({})).toBe('someone')
  })
})
