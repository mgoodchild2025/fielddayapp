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

  it('handles a league with no tracked stats — rows present as W L T with no numbers', () => {
    const c = buildCareer({ ...base, statsByLeague: new Map() })
    expect(c.seasons).toHaveLength(3)
    expect(c.tables).toHaveLength(1)
    expect(c.tables[0].recordColumns).toBe(true)
    expect(c.tables[0].totals).toEqual({ __w: 0, __l: 0, __t: 0 })
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
    expect(c.tables[0].columns.map((col) => col.label)).toEqual(['W', 'L', 'T'])
    expect(c.tables[0].totals).toEqual({ __w: 11, __l: 7, __t: 0 })
    // l3 has no record yet — its cells render as '—' via null stats
    expect(c.tables[0].rows.find((r) => r.seasonLabel === '2026')?.stats.__w).toBeUndefined()
  })

  it('uses one column shape across sports — a tie anywhere gives every record table T', () => {
    const c = buildCareer({
      ...base,
      memberships: [
        ...base.memberships,
        { teamId: 't4', teamName: 'Weekend Warriors', leagueId: 'l4', leagueName: 'Beach Bash', sport: 'tournament', seasonStart: '2026-06-01', createdAt: null },
      ],
      statsByLeague: new Map(),
      statDefsBySport: new Map(),
      teamRecordByLeagueTeam: new Map([
        ['l1:t1', { played: 11, wins: 7, losses: 3, ties: 1 }],
        ['l4:t4', { played: 6, wins: 4, losses: 2, ties: 0 }],
      ]),
    })
    // Same W/L/T shape everywhere → the tables merge into one aligned table.
    expect(c.tables).toHaveLength(1)
    expect(c.tables[0].columns.map((col) => col.label)).toEqual(['W', 'L', 'T'])
  })

  it('record tables always show W L T — with or without a tie — so rows and cards align', () => {
    const c = buildCareer({
      ...base,
      statDefsBySport: new Map(),
      teamRecordByLeagueTeam: new Map([
        ['l1:t1', { played: 10, wins: 7, losses: 3, ties: 0 }],
      ]),
    })
    expect(c.tables[0].columns.map((col) => col.label)).toEqual(['W', 'L', 'T'])
  })

  it('shows the record when columns are defined but the player has no stat values', () => {
    // Platform defaults define columns for every known sport — what matters is
    // whether anything was ever recorded for this player.
    const c = buildCareer({
      ...base,
      statsByLeague: new Map(),
      teamRecordByLeagueTeam: new Map([['l1:t1', { played: 10, wins: 7, losses: 3, ties: 0 }]]),
    })
    expect(c.tables[0].columns.map((col) => col.label)).toEqual(['W', 'L', 'T'])
  })

  it('keeps real stat columns when the sport defines them — record is a fallback', () => {
    const c = buildCareer({
      ...base,
      teamRecordByLeagueTeam: new Map([['l1:t1', { played: 10, wins: 7, losses: 3, ties: 0 }]]),
    })
    expect(c.tables[0].columns.map((col) => col.key)).toEqual(['kills', 'aces', 'blocks'])
    expect(c.tables[0].recordColumns).toBe(false)
  })

  it('shows stat columns for an uncredited player when the LEAGUE tracks stats — teammates match', () => {
    const c = buildCareer({
      ...base,
      statsByLeague: new Map(),
      teamRecordByLeagueTeam: new Map([['l1:t1', { played: 10, wins: 7, losses: 3, ties: 0 }]]),
      leaguesTrackingStats: new Set(['l1']),
    })
    const statTable = c.tables.find((t) => !t.recordColumns)!
    expect(statTable.columns.map((col) => col.key)).toEqual(['kills', 'aces', 'blocks'])
    expect(statTable.rows.map((r) => r.leagueId)).toEqual(['l1'])
    // no values for this player → dashes, not zeros
    expect(statTable.rows[0].stats.kills).toBeUndefined()
    // the untracked leagues stay W/L/T in their own table
    const recordTable = c.tables.find((t) => t.recordColumns)!
    expect(recordTable.rows.map((r) => r.leagueId)).toEqual(['l2', 'l3'])
  })

  it('a league nobody has stats in shows W L T for every player — a veteran\'s history elsewhere does not change it', () => {
    // l3 hasn't started: no games, no stats. The veteran has stats in l1/l2.
    const veteran = buildCareer({
      ...base,
      statsByLeague: new Map([['l1', { kills: 41 }], ['l2', { kills: 58 }]]),
      leaguesTrackingStats: new Set(['l1', 'l2']),
    })
    const rookie = buildCareer({
      ...base,
      memberships: base.memberships.filter((m) => m.leagueId === 'l3'),
      statsByLeague: new Map(),
      leaguesTrackingStats: new Set(['l1', 'l2']),
    })
    const shapeOfL3 = (c: ReturnType<typeof buildCareer>) =>
      c.tables.find((t) => t.rows.some((r) => r.leagueId === 'l3'))!.columns.map((col) => col.label)
    expect(shapeOfL3(veteran)).toEqual(['W', 'L', 'T'])
    expect(shapeOfL3(rookie)).toEqual(['W', 'L', 'T'])
  })

  it('carries the team record on every season row, formatted W-L or W-L-T', () => {
    const c = buildCareer({
      ...base,
      teamRecordByLeagueTeam: new Map([
        ['l1:t1', { played: 10, wins: 7, losses: 3, ties: 0 }],
        ['l2:t2', { played: 9, wins: 4, losses: 4, ties: 1 }],
      ]),
    })
    const byLeague = new Map(c.seasons.map((s) => [s.leagueId, s.record]))
    expect(byLeague.get('l1')).toBe('7-3')
    expect(byLeague.get('l2')).toBe('4-4-1')
    expect(byLeague.get('l3')).toBeNull()
  })

  it('flags record-column tables so the card does not repeat W/L in the team cell', () => {
    const c = buildCareer({
      ...base,
      statDefsBySport: new Map(),
      teamRecordByLeagueTeam: new Map([['l1:t1', { played: 10, wins: 7, losses: 3, ties: 0 }]]),
    })
    expect(c.tables[0].recordColumns).toBe(true)
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
