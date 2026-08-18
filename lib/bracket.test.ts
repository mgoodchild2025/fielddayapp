import { describe, it, expect } from 'vitest'
import {
  nextPowerOf2,
  getBracketSide,
  getRoundName,
  generateSingleEliminationSpec,
  generateDoubleEliminationSpec,
  generate6TeamBracketSpec,
  generate14TeamAllPlaySpec,
  seedFromStandings,
  LB_ROUND_BASE,
  GF_ROUND,
  type BracketSpec,
  type BracketMatchSpec,
  type TeamStanding,
} from './bracket'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** All matches in a spec, including the third-place match when present. */
function allMatches(spec: BracketSpec): BracketMatchSpec[] {
  return spec.thirdPlaceMatch ? [...spec.matches, spec.thirdPlaceMatch] : spec.matches
}

/**
 * Core structural invariant: every winnerTo/loserTo reference must point at a
 * match that exists in the spec. This is what scaffoldBracket relies on when
 * wiring match ids.
 */
function expectAllReferencesResolve(spec: BracketSpec) {
  const keys = new Set(allMatches(spec).map((m) => `${m.roundNumber}:${m.matchNumber}`))
  for (const m of allMatches(spec)) {
    if (m.winnerToRoundNumber !== null) {
      expect(keys, `winner target of R${m.roundNumber} M${m.matchNumber}`)
        .toContain(`${m.winnerToRoundNumber}:${m.winnerToMatchNumber}`)
    }
    if (m.loserToRoundNumber !== null) {
      expect(keys, `loser target of R${m.roundNumber} M${m.matchNumber}`)
        .toContain(`${m.loserToRoundNumber}:${m.loserToMatchNumber}`)
    }
  }
}

/** Each (round, match, slot) may be fed by at most one winner and one loser route. */
function expectNoSlotCollisions(spec: BracketSpec) {
  const filled = new Set<string>()
  for (const m of allMatches(spec)) {
    for (const [r, num, slot] of [
      [m.winnerToRoundNumber, m.winnerToMatchNumber, m.winnerToSlot],
      [m.loserToRoundNumber, m.loserToMatchNumber, m.loserToSlot],
    ] as const) {
      if (r === null || slot === null) continue
      const key = `${r}:${num}:${slot}`
      expect(filled.has(key), `slot ${key} fed twice`).toBe(false)
      filled.add(key)
    }
  }
}

function standing(teamId: string, partial: Partial<TeamStanding> = {}): TeamStanding {
  return {
    teamId, teamName: teamId,
    wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
    ...partial,
  }
}

// ── Math + naming ────────────────────────────────────────────────────────────

describe('nextPowerOf2', () => {
  it('rounds up to the next power of two', () => {
    expect(nextPowerOf2(1)).toBe(1)
    expect(nextPowerOf2(2)).toBe(2)
    expect(nextPowerOf2(3)).toBe(4)
    expect(nextPowerOf2(5)).toBe(8)
    expect(nextPowerOf2(8)).toBe(8)
    expect(nextPowerOf2(9)).toBe(16)
  })
})

describe('getBracketSide', () => {
  it('classifies winners, losers, and grand-final rounds', () => {
    expect(getBracketSide(1)).toBe('winners')
    expect(getBracketSide(4)).toBe('winners')
    expect(getBracketSide(LB_ROUND_BASE)).toBe('losers')
    expect(getBracketSide(LB_ROUND_BASE + 3)).toBe('losers')
    expect(getBracketSide(GF_ROUND)).toBe('grand_final')
  })
})

describe('getRoundName', () => {
  it('names the standard rounds', () => {
    expect(getRoundName(1, 8)).toBe('Final')
    expect(getRoundName(2, 8)).toBe('Semi-Finals')
    expect(getRoundName(4, 8)).toBe('Quarter-Finals')
  })

  it('names early rounds by team count (regression: 16-team first round)', () => {
    // Round number = matches in the round → round contains 2× that many teams.
    expect(getRoundName(8, 16)).toBe('Round of 16')
    expect(getRoundName(16, 32)).toBe('Round of 32')
    expect(getRoundName(8, 32)).toBe('Round of 16')
  })

  it('labels the third-place match', () => {
    expect(getRoundName(1, 8, 2)).toBe('Third Place')
    expect(getRoundName(1, 8, 1)).toBe('Final')
  })

  it('names losers-bracket and grand-final rounds', () => {
    expect(getRoundName(GF_ROUND, 8)).toBe('Grand Final')
    // 8-team DE: 4 LB rounds → LB R1, LB R2, LB Semi-Finals, LB Final
    expect(getRoundName(LB_ROUND_BASE, 8)).toBe('LB Round 1')
    expect(getRoundName(LB_ROUND_BASE + 2, 8)).toBe('LB Semi-Finals')
    expect(getRoundName(LB_ROUND_BASE + 3, 8)).toBe('LB Final')
  })

  it('names the special 6- and 14-team all-play rounds', () => {
    expect(getRoundName(3, 6)).toBe('First Round')
    expect(getRoundName(2, 6)).toBe('Semi-Finals')
    expect(getRoundName(4, 14)).toBe('First Round')
    expect(getRoundName(3, 14)).toBe('Quarter-Finals')
  })
})

// ── Single elimination ───────────────────────────────────────────────────────

describe('generateSingleEliminationSpec', () => {
  it('generates a full 8-team bracket', () => {
    const spec = generateSingleEliminationSpec(8)
    expect(spec.bracketSize).toBe(8)
    expect(spec.rounds).toEqual([4, 2, 1])
    expect(spec.matches).toHaveLength(7)          // 4 + 2 + 1
    expect(spec.matches.every((m) => !m.isBye)).toBe(true)
    expectAllReferencesResolve(spec)
    expectNoSlotCollisions(spec)
  })

  it('protects top seeds in the first round (1v8, 4v5, 3v6, 2v7)', () => {
    const spec = generateSingleEliminationSpec(8)
    const r1 = spec.matches.filter((m) => m.roundNumber === 4)
    // Compare matchups regardless of which slot each seed lands in
    const pairings = r1.map((m) => [m.team1Seed, m.team2Seed].sort((a, b) => a! - b!))
    expect(pairings).toEqual([[1, 8], [4, 5], [3, 6], [2, 7]])
  })

  it('semifinal winners land in opposite final slots', () => {
    const spec = generateSingleEliminationSpec(4)
    const semis = spec.matches.filter((m) => m.roundNumber === 2)
    expect(semis.map((m) => m.winnerToSlot)).toEqual([1, 2])
    expect(semis.every((m) => m.winnerToRoundNumber === 1 && m.winnerToMatchNumber === 1)).toBe(true)
  })

  it('gives byes to top seeds when the field is not a power of two', () => {
    const spec = generateSingleEliminationSpec(6)  // bracket of 8, seeds 7+8 are phantom
    expect(spec.bracketSize).toBe(8)
    const byes = spec.matches.filter((m) => m.isBye)
    expect(byes).toHaveLength(2)
    // Seeds 1 and 2 (paired against phantom 8 and 7) get the byes
    expect(byes.map((m) => m.team1Seed).sort()).toEqual([1, 2])
    expect(byes.every((m) => m.team2Seed === null)).toBe(true)
    expectAllReferencesResolve(spec)
  })

  it('adds a wired third-place match when requested', () => {
    const spec = generateSingleEliminationSpec(4, true)
    expect(spec.thirdPlaceMatch).not.toBeNull()
    expect(spec.thirdPlaceMatch!.roundNumber).toBe(1)
    expect(spec.thirdPlaceMatch!.matchNumber).toBe(2)

    const semis = spec.matches.filter((m) => m.roundNumber === 2)
    expect(semis.map((m) => m.loserToMatchNumber)).toEqual([2, 2])
    expect(semis.map((m) => m.loserToSlot)).toEqual([1, 2])
    expectAllReferencesResolve(spec)
    expectNoSlotCollisions(spec)
  })

  it('handles a 2-team bracket (single final, no onward wiring)', () => {
    const spec = generateSingleEliminationSpec(2)
    expect(spec.matches).toHaveLength(1)
    expect(spec.matches[0]).toMatchObject({
      roundNumber: 1, matchNumber: 1, team1Seed: 1, team2Seed: 2,
      winnerToRoundNumber: null,
    })
  })

  it('generates a 16-team bracket with resolvable wiring', () => {
    const spec = generateSingleEliminationSpec(16)
    expect(spec.matches).toHaveLength(15)
    expect(spec.rounds).toEqual([8, 4, 2, 1])
    expectAllReferencesResolve(spec)
    expectNoSlotCollisions(spec)
  })
})

// ── Double elimination ───────────────────────────────────────────────────────

describe('generateDoubleEliminationSpec', () => {
  it('generates a structurally sound 8-team double elimination bracket', () => {
    const spec = generateDoubleEliminationSpec(8)
    expect(spec.bracketSize).toBe(8)
    expectAllReferencesResolve(spec)
    expectNoSlotCollisions(spec)

    // WB: 7 matches, LB: 6 matches (bracketSize - 2), GF: 1
    const wb = spec.matches.filter((m) => m.roundNumber < LB_ROUND_BASE)
    const lb = spec.matches.filter((m) => m.roundNumber >= LB_ROUND_BASE && m.roundNumber < GF_ROUND)
    const gf = spec.matches.filter((m) => m.roundNumber === GF_ROUND)
    expect(wb).toHaveLength(7)
    expect(lb).toHaveLength(6)
    expect(gf).toHaveLength(1)
  })

  it('routes every winners-bracket loser into the losers bracket', () => {
    const spec = generateDoubleEliminationSpec(8)
    const wb = spec.matches.filter((m) => m.roundNumber < LB_ROUND_BASE)
    for (const m of wb) {
      expect(m.loserToRoundNumber, `WB R${m.roundNumber} M${m.matchNumber} loser route`).not.toBeNull()
      expect(m.loserToRoundNumber!).toBeGreaterThanOrEqual(LB_ROUND_BASE)
    }
  })

  it('sends both bracket winners to the grand final', () => {
    const spec = generateDoubleEliminationSpec(8)
    const intoGf = spec.matches.filter((m) => m.winnerToRoundNumber === GF_ROUND)
    // WB final winner + LB final winner
    expect(intoGf).toHaveLength(2)
    expect(new Set(intoGf.map((m) => m.winnerToSlot))).toEqual(new Set([1, 2]))
  })

  it('falls back to single elimination below 4 teams', () => {
    const spec = generateDoubleEliminationSpec(2)
    expect(spec.matches.every((m) => m.roundNumber < LB_ROUND_BASE)).toBe(true)
  })
})

// ── Special formats ──────────────────────────────────────────────────────────

describe('generate6TeamBracketSpec', () => {
  it('has all 6 teams playing round 1 with a best-loser semifinal slot', () => {
    const spec = generate6TeamBracketSpec()
    expect(spec.matches).toHaveLength(6)
    expect(spec.matches.every((m) => !m.isBye)).toBe(true)
    expect(spec.bestLoserSlot).toEqual({ roundNumber: 2, matchNumber: 2, slot: 2 })

    const r1Seeds = spec.matches
      .filter((m) => m.roundNumber === 3)
      .flatMap((m) => [m.team1Seed, m.team2Seed])
    expect([...r1Seeds].sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6])
    expectAllReferencesResolve(spec)
    expectNoSlotCollisions(spec)
  })

  it('wires semifinal losers to the third-place match when enabled', () => {
    const spec = generate6TeamBracketSpec(true)
    expect(spec.thirdPlaceMatch).not.toBeNull()
    const semis = spec.matches.filter((m) => m.roundNumber === 2)
    expect(semis.every((m) => m.loserToRoundNumber === 1 && m.loserToMatchNumber === 2)).toBe(true)
    expectAllReferencesResolve(spec)
  })
})

describe('generate14TeamAllPlaySpec', () => {
  it('has 14 matches, no byes, and a best-loser QF slot', () => {
    const spec = generate14TeamAllPlaySpec()
    expect(spec.matches).toHaveLength(14)          // 7 + 4 + 2 + 1
    expect(spec.matches.every((m) => !m.isBye)).toBe(true)
    expect(spec.bestLoserSlot).toEqual({ roundNumber: 3, matchNumber: 4, slot: 2 })

    const r1Seeds = spec.matches
      .filter((m) => m.roundNumber === 4)
      .flatMap((m) => [m.team1Seed, m.team2Seed])
    expect([...r1Seeds].sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expectAllReferencesResolve(spec)
    expectNoSlotCollisions(spec)
  })

  it('leaves exactly one quarterfinal slot unfed (the best-loser slot)', () => {
    const spec = generate14TeamAllPlaySpec()
    const fed = new Set(
      spec.matches
        .filter((m) => m.winnerToRoundNumber === 3)
        .map((m) => `${m.winnerToMatchNumber}:${m.winnerToSlot}`)
    )
    // 4 QFs × 2 slots = 8; 7 first-round winners feed 7 of them
    expect(fed.size).toBe(7)
    expect(fed.has('4:2')).toBe(false)             // reserved for best loser
  })
})

// ── Seeding ──────────────────────────────────────────────────────────────────

describe('seedFromStandings', () => {
  it('ranks by wins and assigns seeds 1..n', () => {
    const seeded = seedFromStandings([
      standing('mid', { wins: 2 }),
      standing('top', { wins: 3 }),
      standing('bottom', { wins: 1 }),
    ], 4)
    expect(seeded.map((t) => [t.teamId, t.seed])).toEqual([['top', 1], ['mid', 2], ['bottom', 3]])
  })

  it('truncates to the bracket size', () => {
    const seeded = seedFromStandings([
      standing('a', { wins: 4 }),
      standing('b', { wins: 3 }),
      standing('c', { wins: 2 }),
      standing('d', { wins: 1 }),
    ], 2)
    expect(seeded.map((t) => t.teamId)).toEqual(['a', 'b'])
  })

  it('breaks win ties using the configured PTS method', () => {
    const seeded = seedFromStandings([
      standing('fewSets', { wins: 2, setWins: 3 }),
      standing('manySets', { wins: 2, setWins: 8 }),
    ], 2, 'set_wins')
    expect(seeded[0].teamId).toBe('manySets')
  })

  it('ranks by set wins in volleyball set-based mode regardless of match wins', () => {
    const seeded = seedFromStandings([
      standing('matchWinner', { wins: 5, setWins: 4, setLosses: 0 }),
      standing('setWinner', { wins: 1, setWins: 9, setLosses: 3 }),
    ], 2, 'wins', 'set_based')
    expect(seeded[0].teamId).toBe('setWinner')
  })
})
