import { describe, expect, it } from 'vitest'
import { buildWrapped, isWrappable, type WrappedInputs } from './season-wrapped'

const base: WrappedInputs = { setSport: false, games: [], playoffs: [], medal: null, sessions: 0, teammates: 0, photos: 0 }
const g = (at: string, my: number, their: number, opponent = 'X') => ({ at, my, their, opponent })

describe('buildWrapped', () => {
  it('a team season: record, streak, points, biggest win (in date order)', () => {
    const w = buildWrapped({
      ...base,
      games: [g('2026-10-03', 21, 15, 'Dig Deep'), g('2026-10-01', 18, 21), g('2026-10-05', 21, 19), g('2026-10-07', 25, 10, 'Net Results'), g('2026-10-09', 20, 20)],
      teammates: 9,
    })
    expect([w.played, w.wins, w.losses, w.ties, w.bestStreak]).toEqual([5, 3, 1, 1, 3])
    const tiles = Object.fromEntries(w.tiles.map((t) => [t.key, t]))
    expect(tiles.record.value).toBe('3-1-1')
    expect(tiles.streak.value).toBe('3')
    expect(tiles.points).toMatchObject({ value: '105', label: 'Points scored' })
    expect(tiles.biggest).toMatchObject({ value: '25–10', sub: 'vs Net Results' })
    expect(tiles.teammates.value).toBe('9')
    expect(w.headline).toBe('On fire this season')
  })
  it('never shows a zero or a winless record', () => {
    const w = buildWrapped({ ...base, games: [g('a', 10, 21), g('b', 12, 21)] })
    expect(w.tiles.map((t) => t.key)).toEqual(['played', 'points'])
    expect(w.headline).toBe('Thanks for playing')
  })
  it('set sports count sets won', () => {
    const w = buildWrapped({ ...base, setSport: true, games: [g('a', 2, 1)] })
    expect(w.tiles.find((t) => t.key === 'points')).toMatchObject({ value: '2', label: 'Sets won' })
  })
  it('a drop-in regular with no team', () => {
    const w = buildWrapped({ ...base, sessions: 8, photos: 1 })
    expect(w.tiles.map((t) => `${t.value} ${t.label}`)).toEqual(['8 Drop-ins', '1 Photo shared'])
    expect(w.headline).toBe('You kept showing up')
  })
  it('a medal leads the headline', () => {
    expect(buildWrapped({ ...base, medal: { placement: 'gold', label: 'Champions' } })).toMatchObject({ headline: 'Champions!', medalGlyph: '🥇' })
    expect(buildWrapped({ ...base, medal: { placement: 'silver', label: 'Runner-up' } }).headline).toBe('Runner-up!')
  })
  it('playoff wins', () => {
    const w = buildWrapped({ ...base, playoffs: [{ won: true }, { won: true }, { won: false }] })
    expect(w.tiles.find((t) => t.key === 'playoffs')).toMatchObject({ value: '2', label: 'Playoff wins' })
  })
})

describe('isWrappable', () => {
  it('only finished events', () => {
    expect(isWrappable('completed')).toBe(true)
    expect(isWrappable('archived')).toBe(true)
    expect(isWrappable('active')).toBe(false)
  })
})
