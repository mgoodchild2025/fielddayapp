import { describe, expect, it } from 'vitest'
import {
  displayName, sortRoster, recordLabel, ordinal, teamMetaLine, headToHeadLine,
  pairKey, matchupIsCurrent, teamsPlaylist, teamColor, teamInitials, safeTeamColor,
} from './team-cards'
import { displayShowsBios } from './player-card-gaps'

describe('displayName', () => {
  it('shortens to first name + last initial', () => {
    expect(displayName('Samantha Lee-Wong', 'short')).toBe('Samantha L.')
    expect(displayName('  Pat   van  der Berg ', 'short')).toBe('Pat B.')
    expect(displayName('Cher', 'short')).toBe('Cher')
  })
  it('keeps full names and has a fallback', () => {
    expect(displayName('Sam Lee', 'full')).toBe('Sam Lee')
    expect(displayName(null, 'full')).toBe('Player')
    expect(displayName('   ', 'short')).toBe('Player')
  })
})

describe('sortRoster', () => {
  it('puts the captain first, numbers in order, numberless next, coaches last', () => {
    const out = sortRoster([
      { name: 'Coach Kim', number: null, role: 'coach' as const },
      { name: 'Zed', number: null, role: 'player' as const },
      { name: 'Amy', number: '12', role: 'player' as const },
      { name: 'Bo', number: '3', role: 'player' as const },
      { name: 'Cap', number: '99', role: 'captain' as const },
    ])
    expect(out.map((p) => p.name)).toEqual(['Cap', 'Bo', 'Amy', 'Zed', 'Coach Kim'])
  })
})

describe('records and places', () => {
  it('labels records with ties only when there are ties', () => {
    expect(recordLabel({ played: 0, won: 0, lost: 0, drawn: 0 })).toBeNull()
    expect(recordLabel({ played: 4, won: 3, lost: 1, drawn: 0 })).toBe('3–1')
    expect(recordLabel({ played: 5, won: 3, lost: 1, drawn: 1 })).toBe('3–1–1')
  })
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st'])
  })
  it('shows a place only once the team has played', () => {
    expect(teamMetaLine({ poolName: 'Pool A', rank: 2, played: 0, won: 0, lost: 0, drawn: 0 })).toEqual(['Pool A'])
    expect(teamMetaLine({ poolName: 'Pool A', rank: 2, played: 3, won: 2, lost: 1, drawn: 0 })).toEqual(['Pool A', '2nd', '2–1'])
    expect(teamMetaLine({ poolName: null, rank: 1, played: 1, won: 1, lost: 0, drawn: 0 })).toEqual(['1st overall', '1–0'])
  })
})

describe('headToHeadLine', () => {
  const names: Record<string, string> = { a: 'Spikers', b: 'Net Results' }
  const nameOf = (id: string) => names[id]
  it('reads winner first', () => {
    expect(headToHeadLine({ homeTeamId: 'a', awayTeamId: 'b', homeScore: 18, awayScore: 21, at: '' }, nameOf))
      .toBe('Last meeting: Net Results won 21–18')
  })
  it('handles ties and missing results', () => {
    expect(headToHeadLine({ homeTeamId: 'a', awayTeamId: 'b', homeScore: 20, awayScore: 20, at: '' }, nameOf)).toBe('Last meeting: tied 20–20')
    expect(headToHeadLine({ homeTeamId: 'a', awayTeamId: 'b', homeScore: null, awayScore: 3, at: '' }, nameOf)).toBeNull()
    expect(headToHeadLine(undefined, nameOf)).toBeNull()
  })
  it('keys pairs regardless of home/away', () => {
    expect(pairKey('x', 'y')).toBe(pairKey('y', 'x'))
  })
})

describe('teamsPlaylist', () => {
  const now = Date.parse('2026-11-21T15:00:00Z')
  const at = (min: number) => new Date(now + min * 60_000).toISOString()

  it('airs games from 45 min before to 5 min after start', () => {
    expect(matchupIsCurrent(at(45), now)).toBe(true)
    expect(matchupIsCurrent(at(46), now)).toBe(false)
    expect(matchupIsCurrent(at(-5), now)).toBe(true)
    expect(matchupIsCurrent(at(-6), now)).toBe(false)
  })

  it('opens with current matchups, then teams with a photo after every second card', () => {
    const out = teamsPlaylist({
      matchups: [{ scheduledAt: at(10), id: 'm1' }, { scheduledAt: at(90), id: 'later' }],
      teams: ['A', 'B', 'C', 'D', 'E'],
      photos: ['p1', 'p2', 'p3'],
      nowMs: now,
    })
    expect(out.map((s) => s.kind === 'matchup' ? `m:${s.matchup.id}` : s.kind === 'team' ? s.team : s.photo))
      .toEqual(['m:m1', 'A', 'B', 'p1', 'C', 'D', 'p2', 'E'])
  })

  it('still shows photos when there are no teams', () => {
    const out = teamsPlaylist({ matchups: [], teams: [], photos: ['p1', 'p2'], nowMs: now })
    expect(out.map((s) => s.kind)).toEqual(['photo', 'photo'])
  })
})

describe('team colours', () => {
  it('uses the team colour when valid, else a stable fallback', () => {
    expect(teamColor({ name: 'Spikers', color: '#123456' })).toBe('#123456')
    expect(safeTeamColor('red;}</style>')).toBeNull()
    const a = teamColor({ name: 'Spikers', color: 'red' })
    expect(a).toMatch(/^#[0-9a-f]{6}$/)
    expect(teamColor({ name: 'spikers', color: null })).toBe(a)
  })
  it('makes initials', () => {
    expect(teamInitials('Net Results Inc')).toBe('NR')
    expect(teamInitials('spikers')).toBe('S')
  })
})

describe('displayShowsBios', () => {
  it('counts the teams source (opted-in photos appear on roster cards)', () => {
    expect(displayShowsBios({ zones: [{ type: 'showcase', source: 'teams' }] })).toBe(true)
  })
})
