import { describe, it, expect } from 'vitest'
import { buildCareer, type CareerInputs } from './career'

const base: CareerInputs = {
  memberships: [
    { teamId: 't2', teamName: 'Thunder', leagueId: 'l2', leagueName: 'Winter 2025', sport: 'volleyball', seasonStart: '2025-01-10', createdAt: '2024-12-01' },
    { teamId: 't1', teamName: 'Spikers', leagueId: 'l1', leagueName: 'Winter 2024', sport: 'volleyball', seasonStart: '2024-01-12', createdAt: '2023-12-01' },
    { teamId: 't3', teamName: 'Thunder', leagueId: 'l3', leagueName: 'Winter 2026', sport: 'volleyball', seasonStart: null, createdAt: '2026-01-05' },
  ],
  statsByLeague: new Map([
    ['l1', { kills: 41, aces: 12, blocks: 9 }],
    ['l2', { kills: 58, aces: 15, blocks: 14 }],
    ['l3', { kills: 63, aces: 21, blocks: 17 }],
  ]),
  medalByLeagueTeam: new Map([['l3:t3', 'gold']]),
  statDefsBySport: new Map([
    ['volleyball', [
      { key: 'kills', label: 'Kills' }, { key: 'aces', label: 'Aces' },
      { key: 'blocks', label: 'Blocks' }, { key: 'digs', label: 'Digs' },
    ]],
  ]),
}

describe('buildCareer', () => {
  it('orders seasons oldest-first with year labels (season start, else created)', () => {
    const c = buildCareer(base)
    expect(c.seasons.map((s) => s.seasonLabel)).toEqual(['2024', '2025', '2026'])
    expect(c.seasons.map((s) => s.teamName)).toEqual(['Spikers', 'Thunder', 'Thunder'])
  })

  it('caps stat columns at three (the hockey-card rule) and totals them', () => {
    const c = buildCareer(base)
    expect(c.tables).toHaveLength(1)
    expect(c.tables[0].columns.map((col) => col.key)).toEqual(['kills', 'aces', 'blocks'])
    expect(c.tables[0].totals).toEqual({ kills: 162, aces: 48, blocks: 40 })
  })

  it('marks championship seasons with the medal glyph on the right team only', () => {
    const c = buildCareer(base)
    expect(c.seasons.find((s) => s.seasonLabel === '2026')?.medal).toBe('🥇')
    expect(c.seasons.find((s) => s.seasonLabel === '2025')?.medal).toBeNull()
  })

  it('handles a league with no tracked stats — row present, numbers absent', () => {
    const c = buildCareer({ ...base, statsByLeague: new Map() })
    expect(c.seasons).toHaveLength(3)
    expect(c.tables[0].totals).toEqual({ kills: 0, aces: 0, blocks: 0 })
  })

  it('shows the team W/L record when a sport tracks no player stats', () => {
    const c = buildCareer({
      ...base,
      statDefsBySport: new Map(),
      teamRecordByLeagueTeam: new Map([
        ['l1:t1', { played: 10, wins: 7, losses: 3, ties: 0 }],
        ['l2:t2', { played: 8, wins: 4, losses: 4, ties: 0 }],
      ]),
    })
    expect(c.tables).toHaveLength(1)
    expect(c.tables[0].columns.map((col) => col.label)).toEqual(['W', 'L'])
    expect(c.tables[0].totals).toEqual({ __w: 11, __l: 7 })
    // l3 has no record yet — its cells render as '—' via null stats
    expect(c.tables[0].rows.find((r) => r.seasonLabel === '2026')?.stats.__w).toBeUndefined()
  })

  it('adds a T column only when a tie actually exists', () => {
    const c = buildCareer({
      ...base,
      statDefsBySport: new Map(),
      teamRecordByLeagueTeam: new Map([
        ['l1:t1', { played: 10, wins: 6, losses: 3, ties: 1 }],
      ]),
    })
    expect(c.tables[0].columns.map((col) => col.label)).toEqual(['W', 'L', 'T'])
  })

  it('keeps real stat columns when the sport defines them — record is a fallback', () => {
    const c = buildCareer({
      ...base,
      teamRecordByLeagueTeam: new Map([['l1:t1', { played: 10, wins: 7, losses: 3, ties: 0 }]]),
    })
    expect(c.tables[0].columns.map((col) => col.key)).toEqual(['kills', 'aces', 'blocks'])
  })

  it('merges sports whose stat columns are identical — no repeated header rows', () => {
    // No stat definitions at all: every sport resolves to zero columns, so
    // splitting by sport would just repeat "Season | Team" over each league.
    const c = buildCareer({
      ...base,
      memberships: [
        ...base.memberships,
        { teamId: 't4', teamName: 'Kickers', leagueId: 'l4', leagueName: 'Soccer 2025', sport: 'soccer', seasonStart: '2025-05-01', createdAt: null },
      ],
      statDefsBySport: new Map(),
    })
    expect(c.tables).toHaveLength(1)
    expect(c.tables[0].rows.map((r) => r.teamName)).toEqual(['Spikers', 'Thunder', 'Kickers', 'Thunder'])
  })

  it('groups mixed-sport careers into per-sport tables, longest history first', () => {
    const c = buildCareer({
      ...base,
      memberships: [
        ...base.memberships,
        { teamId: 't4', teamName: 'Kickers', leagueId: 'l4', leagueName: 'Soccer 2025', sport: 'soccer', seasonStart: '2025-05-01', createdAt: null },
      ],
      statDefsBySport: new Map([...base.statDefsBySport, ['soccer', [{ key: 'goals', label: 'Goals' }]]]),
    })
    expect(c.tables.map((t) => t.sport)).toEqual(['volleyball', 'soccer'])
    expect(c.seasonCount).toBe(4)
  })

  it('a rookie has an empty career, not empty furniture', () => {
    const c = buildCareer({ ...base, memberships: [] })
    expect(c.seasonCount).toBe(0)
    expect(c.tables).toEqual([])
  })
})
