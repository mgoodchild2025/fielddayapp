/**
 * Pure bracket generation and seeding logic.
 * No DB calls — takes standings data in, returns match structures out.
 */

export type BracketType = 'single_elimination' | 'double_elimination'
export type SeedingMethod = 'standings' | 'pool_results' | 'manual'

/** LB round numbers start at 100 (avoids collisions with WB round numbers ≤ bracketSize/2 ≤ 8 for 16-team) */
export const LB_ROUND_BASE = 100
/** Grand Final round number */
export const GF_ROUND = 200

/** Infer which bracket side a match belongs to from its round_number */
export function getBracketSide(roundNumber: number): 'winners' | 'losers' | 'grand_final' {
  if (roundNumber >= GF_ROUND) return 'grand_final'
  if (roundNumber >= LB_ROUND_BASE) return 'losers'
  return 'winners'
}

export interface TeamStanding {
  teamId: string
  teamName: string
  divisionId?: string | null
  poolId?: string | null
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  seed?: number // override
}

export interface BracketMatchSpec {
  roundNumber: number  // descending power-of-2: 4=quarters, 2=semis, 1=final. LB: 100+. GF: 200.
  matchNumber: number  // 1-indexed within round
  team1Seed: number | null
  team2Seed: number | null
  isBye: boolean
  winnerToRoundNumber: number | null   // explicit target round (replaces the old roundNumber/2 assumption)
  winnerToMatchNumber: number | null   // match_number in the target round
  winnerToSlot: 1 | 2 | null
  loserToRoundNumber: number | null    // for double elimination: LB round loser drops into
  loserToMatchNumber: number | null
  loserToSlot: 1 | 2 | null
}

export interface BracketSpec {
  bracketSize: number
  rounds: number[]           // e.g. [4, 2, 1] for 8-team (WB rounds only)
  matches: BracketMatchSpec[]
  thirdPlaceMatch: BracketMatchSpec | null
}

// ── Math helpers ──────────────────────────────────────────────────────────────

export function nextPowerOf2(n: number): number {
  if (n <= 1) return 1
  return Math.pow(2, Math.ceil(Math.log2(n)))
}

export function getRoundName(roundNumber: number, bracketSize: number): string {
  // Grand Final
  if (roundNumber >= GF_ROUND) return 'Grand Final'
  // Losers bracket
  if (roundNumber >= LB_ROUND_BASE) {
    const lbIndex = roundNumber - LB_ROUND_BASE + 1 // 1-based
    const n = Math.log2(bracketSize)
    const totalLbRounds = 2 * (n - 1)
    if (lbIndex === totalLbRounds) return 'LB Final'
    if (lbIndex === totalLbRounds - 1) return 'LB Semi-Finals'
    return `LB Round ${lbIndex}`
  }
  // Winners bracket (standard)
  if (roundNumber === 1) return 'Final'
  if (roundNumber === 2) return 'Semi-Finals'
  if (roundNumber === 4) return 'Quarter-Finals'
  const matchesInRound = bracketSize / roundNumber
  if (matchesInRound === 16) return 'Round of 32'
  if (matchesInRound === 8) return 'Round of 16'
  return `Round of ${matchesInRound * 2}`
}

// ── Standard bracket seeding ──────────────────────────────────────────────────
// Produces seed pairings that protect top seeds from meeting early.
// E.g. 8-team: [[1,8],[4,5],[3,6],[2,7]]
// The order of matches determines which winners face each other next round.

function generateFirstRoundPairings(bracketSize: number): [number, number][] {
  if (bracketSize === 2) return [[1, 2]]
  const sub = generateFirstRoundPairings(bracketSize / 2)
  return sub.flatMap(([a, b]) => [
    [a, bracketSize + 1 - a] as [number, number],
    [bracketSize + 1 - b, b] as [number, number],
  ])
}

// ── Single elimination generator ──────────────────────────────────────────────

export function generateSingleEliminationSpec(
  teamsAdvancing: number,
  thirdPlaceGame = false
): BracketSpec {
  const bracketSize = nextPowerOf2(teamsAdvancing)
  const byes = bracketSize - teamsAdvancing

  // Rounds in descending order: [bracketSize/2, ..., 2, 1]
  const rounds: number[] = []
  for (let r = bracketSize / 2; r >= 1; r = Math.floor(r / 2)) {
    rounds.push(r)
  }

  const matches: BracketMatchSpec[] = []

  // ── Round 1 (first round of play) ────────────────────────────────────────
  const firstRound = bracketSize / 2
  const pairings = generateFirstRoundPairings(bracketSize)

  const byeSeeds = new Set<number>()
  for (let i = teamsAdvancing + 1; i <= bracketSize; i++) byeSeeds.add(i)

  for (let i = 0; i < pairings.length; i++) {
    const [s1, s2] = pairings[i]
    const matchNum = i + 1

    const nextRound = firstRound / 2
    const nextMatchNum = Math.ceil(matchNum / 2)
    const nextSlot: 1 | 2 = matchNum % 2 === 1 ? 1 : 2

    const isBye = byeSeeds.has(s1) || byeSeeds.has(s2)
    const realSeed1 = s1 <= teamsAdvancing ? s1 : null
    const realSeed2 = s2 <= teamsAdvancing ? s2 : null
    const team1Seed = isBye ? (realSeed1 ?? realSeed2) : realSeed1
    const team2Seed = isBye ? null : realSeed2

    matches.push({
      roundNumber: firstRound,
      matchNumber: matchNum,
      team1Seed,
      team2Seed,
      isBye,
      winnerToRoundNumber: nextRound >= 1 ? nextRound : null,
      winnerToMatchNumber: nextRound >= 1 ? nextMatchNum : null,
      winnerToSlot: nextRound >= 1 ? nextSlot : null,
      loserToMatchNumber: null,
      loserToRoundNumber: null,
      loserToSlot: null,
    })
  }

  // ── Middle rounds (semis, quarters if needed) ─────────────────────────────
  for (let round = firstRound / 2; round >= 2; round = Math.floor(round / 2)) {
    const matchesInRound = round
    for (let m = 1; m <= matchesInRound; m++) {
      const nextRound = round / 2
      const nextMatchNum = Math.ceil(m / 2)
      const nextSlot: 1 | 2 = m % 2 === 1 ? 1 : 2

      matches.push({
        roundNumber: round,
        matchNumber: m,
        team1Seed: null,
        team2Seed: null,
        isBye: false,
        winnerToRoundNumber: nextRound >= 1 ? nextRound : null,
        winnerToMatchNumber: nextRound >= 1 ? nextMatchNum : null,
        winnerToSlot: nextRound >= 1 ? nextSlot : null,
        loserToRoundNumber: thirdPlaceGame && round === 2 ? 1 : null,
        loserToMatchNumber: thirdPlaceGame && round === 2 ? 2 : null,
        loserToSlot: thirdPlaceGame && round === 2 ? (m === 1 ? 1 : 2) : null,
      })
    }
  }

  // ── Final ─────────────────────────────────────────────────────────────────
  if (firstRound > 1) {
    matches.push({
      roundNumber: 1,
      matchNumber: 1,
      team1Seed: null,
      team2Seed: null,
      isBye: false,
      winnerToRoundNumber: null,
      winnerToMatchNumber: null,
      winnerToSlot: null,
      loserToRoundNumber: thirdPlaceGame ? 1 : null,
      loserToMatchNumber: thirdPlaceGame ? 2 : null,
      loserToSlot: thirdPlaceGame ? null : null,
    })
  }

  // ── Third place ───────────────────────────────────────────────────────────
  let thirdPlaceMatch: BracketMatchSpec | null = null
  if (thirdPlaceGame) {
    thirdPlaceMatch = {
      roundNumber: 1,
      matchNumber: 2,
      team1Seed: null,
      team2Seed: null,
      isBye: false,
      winnerToRoundNumber: null,
      winnerToMatchNumber: null,
      winnerToSlot: null,
      loserToRoundNumber: null,
      loserToMatchNumber: null,
      loserToSlot: null,
    }
  }

  return { bracketSize, rounds, matches, thirdPlaceMatch }
}

// ── Double elimination generator ──────────────────────────────────────────────
//
// Round numbering:
//   Winners bracket:   same as single elim (powers of 2, e.g. 4,2,1 for 8-team)
//   Losers bracket:    LB_ROUND_BASE(100), 101, 102, …  (sequential)
//   Grand Final:       GF_ROUND (200)
//
// LB structure for bracketSize = 2^n:
//   LBR1 (offset 0):        WBR1 losers pair off → bracketSize/4 matches
//   For k = 1..n-1:
//     feed-in (offset 2k-1): WBRk+1 losers enter against LB survivors
//     pure LB (offset 2k):   LB survivors vs each other  (skipped for k=n-1)
//
// Total LB rounds = 2*(n-1), Grand Final is 1 additional match.

export function generateDoubleEliminationSpec(teamsAdvancing: number): BracketSpec {
  const bracketSize = nextPowerOf2(teamsAdvancing)

  // Fall back to single elim for 2-team brackets (DE doesn't make sense)
  if (bracketSize < 4) return generateSingleEliminationSpec(teamsAdvancing, false)

  const n = Math.log2(bracketSize) // number of WB rounds

  const byeSeeds = new Set<number>()
  for (let i = teamsAdvancing + 1; i <= bracketSize; i++) byeSeeds.add(i)

  // WB round numbers in play order: [bracketSize/2, bracketSize/4, …, 2, 1]
  const wbRoundsOrdered: number[] = []
  for (let r = bracketSize / 2; r >= 1; r = Math.floor(r / 2)) wbRoundsOrdered.push(r)
  // wbRoundsOrdered[0] = first WB round (most matches), wbRoundsOrdered[n-1] = 1 (WB Final)

  const allMatches: BracketMatchSpec[] = []

  // ── Winners bracket ────────────────────────────────────────────────────────
  const pairings = generateFirstRoundPairings(bracketSize)
  const firstWbRound = wbRoundsOrdered[0] // = bracketSize/2

  // WBR1 (first played round)
  for (let i = 0; i < pairings.length; i++) {
    const [s1, s2] = pairings[i]
    const matchNum = i + 1

    const isBye = byeSeeds.has(s1) || byeSeeds.has(s2)
    const realSeed1 = s1 <= teamsAdvancing ? s1 : null
    const realSeed2 = s2 <= teamsAdvancing ? s2 : null
    const team1Seed = isBye ? (realSeed1 ?? realSeed2) : realSeed1
    const team2Seed = isBye ? null : realSeed2

    const nextWbRound = firstWbRound / 2
    const winnerToMatchNum = Math.ceil(matchNum / 2)
    const winnerToSlot: 1 | 2 = matchNum % 2 === 1 ? 1 : 2

    // Loser goes to LBR1: WBR1 matches pair off (M1+M2 → LBR1/M1, M3+M4 → LBR1/M2, …)
    const lbMatchNum = Math.ceil(matchNum / 2)
    const lbSlot: 1 | 2 = matchNum % 2 === 1 ? 1 : 2

    allMatches.push({
      roundNumber: firstWbRound,
      matchNumber: matchNum,
      team1Seed,
      team2Seed,
      isBye,
      winnerToRoundNumber: nextWbRound,
      winnerToMatchNumber: winnerToMatchNum,
      winnerToSlot,
      loserToRoundNumber: isBye ? null : LB_ROUND_BASE,
      loserToMatchNumber: isBye ? null : lbMatchNum,
      loserToSlot: isBye ? null : lbSlot,
    })
  }

  // WB middle rounds (between first round and WB Final)
  for (let wbRoundIdx = 1; wbRoundIdx < n - 1; wbRoundIdx++) {
    const wbRound = wbRoundsOrdered[wbRoundIdx]
    const matchesInRound = wbRound // Round r always has r matches in the WB
    const nextWbRound = wbRound / 2
    // Feed-in LB round for this WB round's losers: LB offset = 2*wbRoundIdx - 1
    const lbFeedInRound = LB_ROUND_BASE + 2 * wbRoundIdx - 1

    for (let m = 1; m <= matchesInRound; m++) {
      const winnerToMatchNum = Math.ceil(m / 2)
      const winnerToSlot: 1 | 2 = m % 2 === 1 ? 1 : 2

      allMatches.push({
        roundNumber: wbRound,
        matchNumber: m,
        team1Seed: null,
        team2Seed: null,
        isBye: false,
        winnerToRoundNumber: nextWbRound,
        winnerToMatchNumber: winnerToMatchNum,
        winnerToSlot,
        loserToRoundNumber: lbFeedInRound,
        loserToMatchNumber: m, // same match number; loser is always slot 2 in feed-in rounds
        loserToSlot: 2,
      })
    }
  }

  // WB Final (round 1) — winner goes to GF slot 1, loser goes to LB Final slot 2
  const lbFinalRound = LB_ROUND_BASE + 2 * (n - 1) - 1
  allMatches.push({
    roundNumber: 1,
    matchNumber: 1,
    team1Seed: null,
    team2Seed: null,
    isBye: false,
    winnerToRoundNumber: GF_ROUND,
    winnerToMatchNumber: 1,
    winnerToSlot: 1,
    loserToRoundNumber: lbFinalRound,
    loserToMatchNumber: 1,
    loserToSlot: 2,
  })

  // ── Losers bracket ────────────────────────────────────────────────────────
  // LBR1 (offset 0): pairs WBR1 losers; bracketSize/4 matches
  const lbR1Count = bracketSize / 4

  for (let m = 1; m <= lbR1Count; m++) {
    allMatches.push({
      roundNumber: LB_ROUND_BASE,
      matchNumber: m,
      team1Seed: null,
      team2Seed: null,
      isBye: false,
      winnerToRoundNumber: LB_ROUND_BASE + 1, // → first feed-in round
      winnerToMatchNumber: m, // same match number in LBR2; LBR1 winners fill slot 1
      winnerToSlot: 1,
      loserToRoundNumber: null,
      loserToMatchNumber: null,
      loserToSlot: null,
    })
  }

  // Remaining LB rounds: alternating feed-in and pure-LB rounds
  for (let k = 1; k <= n - 1; k++) {
    const feedInOffset = 2 * k - 1
    const feedInRound = LB_ROUND_BASE + feedInOffset
    const isLbFinal = feedInOffset === 2 * (n - 1) - 1 // Last LB feed-in = LB Final

    // Feed-in round: WBR(k+1) losers enter. Match count = wbRoundsOrdered[k] matches.
    const feedInMatchCount = wbRoundsOrdered[k]

    for (let m = 1; m <= feedInMatchCount; m++) {
      // Winner goes to: LB Final → GF slot 2; otherwise next pure-LB round
      const nextRound = isLbFinal ? GF_ROUND : LB_ROUND_BASE + feedInOffset + 1
      const nextMatchNum = isLbFinal ? 1 : Math.ceil(m / 2)
      const nextSlot: 1 | 2 = isLbFinal ? 2 : (m % 2 === 1 ? 1 : 2)

      allMatches.push({
        roundNumber: feedInRound,
        matchNumber: m,
        team1Seed: null,
        team2Seed: null,
        isBye: false,
        winnerToRoundNumber: nextRound,
        winnerToMatchNumber: nextMatchNum,
        winnerToSlot: nextSlot,
        loserToRoundNumber: null,
        loserToMatchNumber: null,
        loserToSlot: null,
      })
    }

    if (!isLbFinal) {
      // Pure LB elimination round: feed-in winners play each other
      const pureOffset = feedInOffset + 1
      const pureRound = LB_ROUND_BASE + pureOffset
      const pureMatchCount = feedInMatchCount / 2
      const nextFeedInRound = LB_ROUND_BASE + pureOffset + 1

      for (let m = 1; m <= pureMatchCount; m++) {
        allMatches.push({
          roundNumber: pureRound,
          matchNumber: m,
          team1Seed: null,
          team2Seed: null,
          isBye: false,
          winnerToRoundNumber: nextFeedInRound, // → next feed-in, same match, slot 1
          winnerToMatchNumber: m,
          winnerToSlot: 1,
          loserToRoundNumber: null,
          loserToMatchNumber: null,
          loserToSlot: null,
        })
      }
    }
  }

  // Grand Final
  allMatches.push({
    roundNumber: GF_ROUND,
    matchNumber: 1,
    team1Seed: null,
    team2Seed: null,
    isBye: false,
    winnerToRoundNumber: null,
    winnerToMatchNumber: null,
    winnerToSlot: null,
    loserToRoundNumber: null,
    loserToMatchNumber: null,
    loserToSlot: null,
  })

  const rounds: number[] = []
  for (let r = bracketSize / 2; r >= 1; r = Math.floor(r / 2)) rounds.push(r)

  return { bracketSize, rounds, matches: allMatches, thirdPlaceMatch: null }
}

// ── Seeding from standings ────────────────────────────────────────────────────

export function seedFromStandings(standings: TeamStanding[], bracketSize: number): TeamStanding[] {
  const sorted = [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    const diffA = a.pointsFor - a.pointsAgainst
    const diffB = b.pointsFor - b.pointsAgainst
    if (diffB !== diffA) return diffB - diffA
    return b.pointsFor - a.pointsFor
  })
  return sorted.slice(0, bracketSize).map((t, i) => ({ ...t, seed: i + 1 }))
}

// Seeding for leagues with multiple divisions:
// Division winners get the top seeds (sorted by overall record),
// then wild cards fill remaining spots.
export function seedFromDivisionStandings(
  divisionStandings: { divisionId: string; divisionName: string; teams: TeamStanding[] }[],
  bracketSize: number
): TeamStanding[] {
  // Division winners (1st place in each division), sorted by overall record
  const winners = divisionStandings
    .map((div) => {
      const sorted = seedFromStandings(div.teams, 1)
      return sorted[0] ?? null
    })
    .filter(Boolean) as TeamStanding[]

  const winnerIds = new Set(winners.map((w) => w.teamId))

  // Wild cards: all non-winners, sorted by record
  const allNonWinners = divisionStandings
    .flatMap((div) => div.teams)
    .filter((t) => !winnerIds.has(t.teamId))

  const wildcards = seedFromStandings(allNonWinners, bracketSize - winners.length)

  return [...winners, ...wildcards]
    .slice(0, bracketSize)
    .map((t, i) => ({ ...t, seed: i + 1 }))
}

// Seeding from pool play:
// Pool 1st, Pool 2nd, etc. interleaved so pools don't rematch immediately.
// E.g. 2 pools of 4: A1, B1, A2, B2, A3, B3, A4, B4
export function seedFromPoolStandings(
  poolStandings: { poolId: string; poolName: string; teams: TeamStanding[] }[],
  bracketSize: number
): TeamStanding[] {
  const maxRank = Math.max(...poolStandings.map((p) => p.teams.length))
  const seeded: TeamStanding[] = []

  for (let rank = 0; rank < maxRank && seeded.length < bracketSize; rank++) {
    for (const pool of poolStandings) {
      const sorted = seedFromStandings(pool.teams, pool.teams.length)
      if (sorted[rank]) seeded.push(sorted[rank])
      if (seeded.length >= bracketSize) break
    }
  }

  return seeded.slice(0, bracketSize).map((t, i) => ({ ...t, seed: i + 1 }))
}

// ── Bracket recommendation ────────────────────────────────────────────────────

export interface BracketRecommendation {
  bracketSize: number
  teamsAdvancing: number
  bracketType: BracketType
  reason: string
  alternatives: { bracketSize: number; teamsAdvancing: number; label: string }[]
}

export function recommendBracket(opts: {
  teamCount: number
  divisionCount: number
  poolCount: number
  eventType: 'league' | 'tournament' | 'pickup' | 'drop_in'
}): BracketRecommendation {
  const { teamCount, divisionCount, poolCount } = opts

  // Can't do a bracket with fewer than 2 teams
  if (teamCount < 2) {
    return {
      bracketSize: 2,
      teamsAdvancing: teamCount,
      bracketType: 'single_elimination',
      reason: 'Not enough teams for a bracket yet.',
      alternatives: [],
    }
  }

  const size = nextPowerOf2(Math.min(teamCount, 8))
  const advancing = Math.min(teamCount, size)

  // Build alternatives based on team count
  const alternatives: BracketRecommendation['alternatives'] = []
  const possibleSizes = [2, 4, 8, 16].filter(
    (s) => s <= teamCount && s !== advancing
  )
  for (const s of possibleSizes) {
    alternatives.push({
      bracketSize: s,
      teamsAdvancing: s,
      label: `Top ${s} teams`,
    })
  }

  if (poolCount >= 2) {
    return {
      bracketSize: nextPowerOf2(poolCount * 2),
      teamsAdvancing: poolCount * 2,
      bracketType: 'single_elimination',
      reason: `Top 2 teams from each of your ${poolCount} pools advance to a ${poolCount * 2}-team bracket. Pool seedings determine bracket seeds.`,
      alternatives,
    }
  }

  if (divisionCount >= 2) {
    return {
      bracketSize: nextPowerOf2(divisionCount * 2),
      teamsAdvancing: divisionCount * 2,
      bracketType: 'single_elimination',
      reason: `Top 2 teams from each of your ${divisionCount} divisions advance (division winner + runner-up). Division champions are top-seeded.`,
      alternatives: [
        ...alternatives,
        {
          bracketSize: nextPowerOf2(divisionCount),
          teamsAdvancing: divisionCount,
          label: `Division champions only (${divisionCount}-team bracket)`,
        },
      ],
    }
  }

  if (teamCount <= 4) {
    return {
      bracketSize: 4,
      teamsAdvancing: teamCount,
      bracketType: 'single_elimination',
      reason: `Clean ${teamCount}-team single elimination${teamCount < 4 ? ' with ' + (4 - teamCount) + ' bye(s)' : ''}.`,
      alternatives: [],
    }
  }

  const byeCount = size - teamCount
  return {
    bracketSize: size,
    teamsAdvancing: advancing,
    bracketType: 'single_elimination',
    reason: `${advancing}-team single elimination${byeCount > 0 ? `. Top ${byeCount} seed${byeCount > 1 ? 's' : ''} receive${byeCount === 1 ? 's' : ''} a first-round bye.` : '.'}`,
    alternatives,
  }
}
