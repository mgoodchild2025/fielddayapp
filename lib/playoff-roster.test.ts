import { describe, it, expect } from 'vitest'
import { applyRoster, moveInField, renumberSeeds, rosterIsActive, EMPTY_ROSTER } from './playoff-roster'

const standings = [
  { teamId: 'a', teamName: 'Aces' },
  { teamId: 'b', teamName: 'Bolts' },
  { teamId: 'c', teamName: 'Comets' },
  { teamId: 'd', teamName: 'Ducks' },
]

const ids = (teams: { teamId: string }[]) => teams.map((t) => t.teamId)

describe('applyRoster', () => {
  it('is a no-op for an empty roster', () => {
    expect(applyRoster(standings, EMPTY_ROSTER)).toEqual(standings)
  })

  it('drops excluded teams and shifts everyone below up', () => {
    const field = applyRoster(standings, { customOrder: null, excluded: ['b'] })
    expect(ids(field)).toEqual(['a', 'c', 'd'])
    // Seed 2 is now Comets, who were seed 3 in standings
    expect(renumberSeeds(field)[1]).toMatchObject({ teamId: 'c', seed: 2 })
  })

  it('honours a full custom order', () => {
    const field = applyRoster(standings, { customOrder: ['d', 'c', 'b', 'a'], excluded: [] })
    expect(ids(field)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('appends teams missing from a stale order in standings order', () => {
    const field = applyRoster(standings, { customOrder: ['d', 'b'], excluded: [] })
    expect(ids(field)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('ignores ids that no longer exist and never duplicates', () => {
    const field = applyRoster(standings, { customOrder: ['ghost', 'c', 'c', 'a'], excluded: [] })
    expect(ids(field)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('exclusion wins over an order that still lists the team', () => {
    const field = applyRoster(standings, { customOrder: ['b', 'a', 'c', 'd'], excluded: ['b'] })
    expect(ids(field)).toEqual(['a', 'c', 'd'])
  })

  it('leaves the input array untouched', () => {
    const before = ids(standings)
    applyRoster(standings, { customOrder: ['d', 'c'], excluded: ['a'] })
    expect(ids(standings)).toEqual(before)
  })
})

describe('rosterIsActive', () => {
  it('is false only when nothing is set', () => {
    expect(rosterIsActive(EMPTY_ROSTER)).toBe(false)
    expect(rosterIsActive({ customOrder: [], excluded: [] })).toBe(false)
    expect(rosterIsActive({ customOrder: ['a'], excluded: [] })).toBe(true)
    expect(rosterIsActive({ customOrder: null, excluded: ['a'] })).toBe(true)
  })
})

describe('moveInField', () => {
  const full = ['a', 'b', 'c', 'd']

  it('moves up and down within the visible field', () => {
    expect(moveInField(full, full, 'c', -1)).toEqual(['a', 'c', 'b', 'd'])
    expect(moveInField(full, full, 'b', 1)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('hops over teams that are sitting out', () => {
    // 'b' sits out, so moving 'c' up must land it above 'a', not above 'b'
    expect(moveInField(full, ['a', 'c', 'd'], 'c', -1)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('is a no-op at the ends of the visible field', () => {
    expect(moveInField(full, ['a', 'c', 'd'], 'a', -1)).toEqual(full)
    expect(moveInField(full, ['a', 'c', 'd'], 'd', 1)).toEqual(full)
  })

  it('ignores teams that are not in the visible field', () => {
    expect(moveInField(full, ['a', 'c', 'd'], 'b', -1)).toEqual(full)
    expect(moveInField(full, full, 'ghost', -1)).toEqual(full)
  })
})
