import { describe, it, expect } from 'vitest'
import {
  computeStreaks,
  accumulateGameResult,
  emptyTeamStat,
  computePts,
  sortMatchBased,
  sortSetBased,
  sortStandings,
  isVolleyballSport,
  type TeamStat,
  type TeamStatTotals,
} from './standings'

function team(partial: Partial<TeamStat> & { id: string }): TeamStat {
  return { name: partial.id, ...emptyTeamStat(), ...partial } as TeamStat
}

describe('isVolleyballSport', () => {
  it('recognises volleyball sports', () => {
    expect(isVolleyballSport('volleyball')).toBe(true)
    expect(isVolleyballSport('beach_volleyball')).toBe(true)
  })
  it('rejects everything else, including null/undefined', () => {
    expect(isVolleyballSport('soccer')).toBe(false)
    expect(isVolleyballSport(null)).toBe(false)
    expect(isVolleyballSport(undefined)).toBe(false)
  })
})

describe('accumulateGameResult', () => {
  it('records a win/loss and points for a non-volleyball game', () => {
    const stats = new Map<string, TeamStatTotals>()
    accumulateGameResult(stats, { homeTeamId: 'A', awayTeamId: 'B', homeScore: 3, awayScore: 1 }, false)

    const a = stats.get('A')!
    const b = stats.get('B')!
    expect(a).toMatchObject({ matchesPlayed: 1, wins: 1, losses: 0, ties: 0, pointsFor: 3, pointsAgainst: 1 })
    expect(b).toMatchObject({ matchesPlayed: 1, wins: 0, losses: 1, ties: 0, pointsFor: 1, pointsAgainst: 3 })
  })

  it('records a tie when scores are level', () => {
    const stats = new Map<string, TeamStatTotals>()
    accumulateGameResult(stats, { homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 2 }, false)
    expect(stats.get('A')!.ties).toBe(1)
    expect(stats.get('B')!.ties).toBe(1)
  })

  it('treats null scores as 0-0 (a tie)', () => {
    const stats = new Map<string, TeamStatTotals>()
    accumulateGameResult(stats, { homeTeamId: 'A', awayTeamId: 'B', homeScore: null, awayScore: null }, false)
    expect(stats.get('A')!.ties).toBe(1)
    expect(stats.get('A')!.pointsFor).toBe(0)
  })

  it('double forfeit (no forfeiting team) is a loss for both', () => {
    const stats = new Map<string, TeamStatTotals>()
    accumulateGameResult(stats, {
      homeTeamId: 'A', awayTeamId: 'B', homeScore: 0, awayScore: 0,
      isForfeit: true, forfeitTeamId: null,
    }, false)
    expect(stats.get('A')!.losses).toBe(1)
    expect(stats.get('B')!.losses).toBe(1)
    expect(stats.get('A')!.wins).toBe(0)
  })

  it('single forfeit falls through to the score (winner still recorded)', () => {
    const stats = new Map<string, TeamStatTotals>()
    accumulateGameResult(stats, {
      homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 0,
      isForfeit: true, forfeitTeamId: 'B',
    }, false)
    expect(stats.get('A')!.wins).toBe(1)
    expect(stats.get('B')!.losses).toBe(1)
  })

  it('accumulates set wins and set-level points for volleyball', () => {
    const stats = new Map<string, TeamStatTotals>()
    accumulateGameResult(stats, {
      homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1,
      sets: [{ home: 25, away: 20 }, { home: 18, away: 25 }, { home: 25, away: 23 }],
    }, true)

    const a = stats.get('A')!
    const b = stats.get('B')!
    expect(a).toMatchObject({ wins: 1, setWins: 2, setLosses: 1, pointsFor: 68, pointsAgainst: 68 })
    expect(b).toMatchObject({ losses: 1, setWins: 1, setLosses: 2, pointsFor: 68, pointsAgainst: 68 })
  })

  it('volleyball without set data falls back to match-score points', () => {
    const stats = new Map<string, TeamStatTotals>()
    accumulateGameResult(stats, { homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 0, sets: null }, true)
    expect(stats.get('A')!.pointsFor).toBe(2)
    expect(stats.get('A')!.setWins).toBe(0)
  })

  it('accumulates across multiple games for the same team', () => {
    const stats = new Map<string, TeamStatTotals>()
    accumulateGameResult(stats, { homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0 }, false)
    accumulateGameResult(stats, { homeTeamId: 'C', awayTeamId: 'A', homeScore: 2, awayScore: 1 }, false)
    expect(stats.get('A')!).toMatchObject({ matchesPlayed: 2, wins: 1, losses: 1, pointsFor: 2, pointsAgainst: 2 })
  })
})

describe('computePts', () => {
  const t = team({ id: 'A', wins: 3, setWins: 7, setLosses: 2, pointsFor: 150 })
  it('supports each PTS method', () => {
    expect(computePts(t, 'wins')).toBe(3)
    expect(computePts(t, 'set_wins')).toBe(7)
    expect(computePts(t, 'set_differential')).toBe(5)
    expect(computePts(t, 'points_for')).toBe(150)
  })
})

describe('sortMatchBased', () => {
  it('sorts by wins first', () => {
    const sorted = sortMatchBased([
      team({ id: 'low', wins: 1 }),
      team({ id: 'high', wins: 3 }),
    ], 'wins')
    expect(sorted.map((t) => t.id)).toEqual(['high', 'low'])
  })

  it('breaks win ties with the PTS method', () => {
    const sorted = sortMatchBased([
      team({ id: 'fewerSets', wins: 2, setWins: 4 }),
      team({ id: 'moreSets', wins: 2, setWins: 6 }),
    ], 'set_wins')
    expect(sorted.map((t) => t.id)).toEqual(['moreSets', 'fewerSets'])
  })

  it('breaks remaining ties with set ratio, then point differential', () => {
    // Same wins + same PTS(wins) → set ratio decides
    const byRatio = sortMatchBased([
      team({ id: 'ratio1', wins: 2, setWins: 4, setLosses: 4 }),
      team({ id: 'ratio2', wins: 2, setWins: 6, setLosses: 3 }),
    ], 'wins')
    expect(byRatio.map((t) => t.id)).toEqual(['ratio2', 'ratio1'])

    // Same everything except point differential
    const byPd = sortMatchBased([
      team({ id: 'pdLow', wins: 2, pointsFor: 10, pointsAgainst: 8 }),
      team({ id: 'pdHigh', wins: 2, pointsFor: 15, pointsAgainst: 5 }),
    ], 'wins')
    expect(byPd.map((t) => t.id)).toEqual(['pdHigh', 'pdLow'])
  })

  it('unbeaten-in-sets teams rank above teams with set losses at equal set wins', () => {
    const sorted = sortMatchBased([
      team({ id: 'someLosses', wins: 2, setWins: 6, setLosses: 2 }),
      team({ id: 'unbeaten', wins: 2, setWins: 6, setLosses: 0 }),
    ], 'wins')
    expect(sorted.map((t) => t.id)).toEqual(['unbeaten', 'someLosses'])
  })

  it('does not mutate the input array', () => {
    const input = [team({ id: 'b', wins: 1 }), team({ id: 'a', wins: 2 })]
    sortMatchBased(input, 'wins')
    expect(input.map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('sortSetBased', () => {
  it('sorts by set wins → set differential → point differential', () => {
    const sorted = sortSetBased([
      team({ id: 'c', setWins: 5, setLosses: 5, pointsFor: 100, pointsAgainst: 100 }),
      team({ id: 'a', setWins: 7, setLosses: 3 }),
      team({ id: 'b', setWins: 5, setLosses: 5, pointsFor: 110, pointsAgainst: 90 }),
    ])
    expect(sorted.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('sortStandings', () => {
  const teams = [
    team({ id: 'matchWinner', wins: 3, setWins: 2 }),
    team({ id: 'setWinner', wins: 1, setWins: 9 }),
  ]

  it('uses set-based sorting only for volleyball in set_based mode', () => {
    const setBased = sortStandings(teams, 'volleyball', 'set_based', 'wins')
    expect(setBased[0].id).toBe('setWinner')
  })

  it('uses match-based sorting otherwise (even volleyball in match mode)', () => {
    const matchBased = sortStandings(teams, 'volleyball', 'match_based', 'wins')
    expect(matchBased[0].id).toBe('matchWinner')

    const nonVb = sortStandings(teams, 'soccer', 'set_based', 'wins')
    expect(nonVb[0].id).toBe('matchWinner')
  })
})
const g = (home: string, away: string, hs: number, as: number, date: string) => ({
  homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, scheduledAt: date,
})

describe('computeStreaks', () => {
  it('finds trailing runs of 2+ and hides single-game runs', () => {
    const streaks = computeStreaks([
      g('a', 'b', 2, 1, '2026-01-01'), // a W, b L
      g('a', 'c', 3, 0, '2026-01-08'), // a W, c L
      g('b', 'c', 1, 1, '2026-01-15'), // ties
      g('a', 'b', 0, 2, '2026-01-22'), // a L, b W — both runs of 1
    ])
    expect(streaks.get('a')).toBeUndefined() // trailing L1
    expect(streaks.get('b')).toBeUndefined() // trailing W1
    expect(streaks.get('c')).toBeUndefined() // L then T — trailing T1
  })

  it('counts win and loss streaks chronologically regardless of input order', () => {
    const streaks = computeStreaks([
      g('a', 'b', 1, 0, '2026-02-15'),
      g('b', 'a', 0, 3, '2026-02-01'),
      g('a', 'c', 2, 0, '2026-02-08'),
    ])
    expect(streaks.get('a')).toBe('W3')
    expect(streaks.get('b')).toBe('L2')
  })

  it('double forfeits count as losses for both teams', () => {
    const streaks = computeStreaks([
      { ...g('a', 'b', 0, 0, '2026-03-01'), isForfeit: true, forfeitTeamId: null },
      { ...g('a', 'b', 0, 0, '2026-03-08'), isForfeit: true, forfeitTeamId: null },
    ])
    expect(streaks.get('a')).toBe('L2')
    expect(streaks.get('b')).toBe('L2')
  })
})
