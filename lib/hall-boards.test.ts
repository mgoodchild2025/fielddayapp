import { describe, it, expect } from 'vitest'
import { decoratedTiers, repeatChampions, statLeaders, tallyShelf, tenureTiers, type MedalRecipientRow } from './hall-boards'

const gold = (leagueId: string, year: string, userId: string, name: string, placement = 'gold'): MedalRecipientRow =>
  ({ medalId: `${leagueId}-${placement}`, leagueId, placement, year, userId, name })

describe('decoratedTiers', () => {
  it('groups identical tallies instead of cutting an alphabetical top 10', () => {
    const rows = [
      gold('l1', '2025', 'a', 'Ann'), gold('l2', '2026', 'a', 'Ann'),
      gold('l1', '2025', 'b', 'Bob'), gold('l1', '2025', 'c', 'Cal'), gold('l1', '2025', 'd', 'Dee'),
      gold('l3', '2026', 'e', 'Eve', 'silver'),
    ]
    const tiers = decoratedTiers(rows)
    expect(tiers.map((t) => tallyShelf(t))).toEqual(['🥇2', '🥇', '🥈'])
    expect(tiers[1].players.map((p) => p.name)).toEqual(['Bob', 'Cal', 'Dee'])
  })

  it('keys by user id when present, else by name', () => {
    const tiers = decoratedTiers([gold('l1', '2025', null as unknown as string, 'Ghost'), gold('l2', '2026', null as unknown as string, 'ghost')])
    expect(tiers).toHaveLength(1)
    expect(tiers[0].gold).toBe(2)
  })
})

describe('repeatChampions', () => {
  it('requires gold in two or more DIFFERENT events', () => {
    const rows = [
      gold('l1', '2025', 'a', 'Ann'), gold('l2', '2026', 'a', 'Ann'),
      gold('l1', '2025', 'b', 'Bob'),
      // two golds in the same league (e.g. re-awarded) count once
      gold('l1', '2025', 'c', 'Cal'), { ...gold('l1', '2025', 'c', 'Cal'), medalId: 'dup' },
      gold('l3', '2026', 'b', 'Bob', 'silver'),
    ]
    const r = repeatChampions(rows)
    expect(r).toEqual([{ userId: 'a', name: 'Ann', titles: 2, years: ['2025', '2026'] }])
  })
})

describe('tenureTiers', () => {
  it('groups by distinct events played, top tiers only, at least two seasons', () => {
    const m = (userId: string, name: string, ...leagues: string[]) => leagues.map((leagueId) => ({ userId, name, leagueId }))
    const tiers = tenureTiers([
      ...m('a', 'Ann', 'l1', 'l2', 'l3', 'l4'),
      ...m('b', 'Bob', 'l1', 'l2', 'l3'),
      ...m('c', 'Cal', 'l1', 'l2', 'l3'),
      ...m('d', 'Dee', 'l1', 'l2'),
      ...m('e', 'Eve', 'l1'),
      ...m('f', 'Fay', 'l1', 'l1'), // same event twice is one season
    ])
    expect(tiers.map((t) => [t.seasons, t.players.map((p) => p.name)])).toEqual([
      [4, ['Ann']], [3, ['Bob', 'Cal']], [2, ['Dee']],
    ])
  })
})

describe('statLeaders', () => {
  it('totals the sport headline stat per player and ranks the top five', () => {
    const headline = new Map([['volleyball', { key: 'kills', label: 'Kills' }]])
    const rows = [
      { userId: 'a', name: 'Ann', sport: 'volleyball', statKey: 'kills', value: 10 },
      { userId: 'a', name: 'Ann', sport: 'volleyball', statKey: 'kills', value: 5 },
      { userId: 'a', name: 'Ann', sport: 'volleyball', statKey: 'aces', value: 99 }, // not the headline stat
      { userId: 'b', name: 'Bob', sport: 'volleyball', statKey: 'kills', value: 12 },
      { userId: 'c', name: 'Cal', sport: 'volleyball', statKey: 'kills', value: 0 },
      { userId: 'd', name: 'Dee', sport: 'soccer', statKey: 'goals', value: 3 },      // sport with no headline def
    ]
    const boards = statLeaders(rows, headline)
    expect(boards).toHaveLength(1)
    expect(boards[0].statLabel).toBe('Kills')
    expect(boards[0].players.map((p) => [p.name, p.value])).toEqual([['Ann', 15], ['Bob', 12]])
  })
})
