/**
 * Pure bracket generation and seeding logic.
 * No DB calls — takes standings data in, returns match structures out.
 */

export type BracketType = 'single_elimination' | 'double_elimination'
export type SeedingMethod = 'standings' | 'pool_results' | 'manual'

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
  roundNumber: number  // descending power-of-2: 4=quarters, 2=semis, 1=final
  matchNumber: number  // 1-indexed within round
  team1Seed: number | null
  team2Seed: number | null
  isBye: boolean
  winnerToMatchNumber: number | null  // match_number in the next round
  winnerToSlot: 1 | 2 | null
  loserToMatchNumber: number | null   // for double elimination
  loserToSlot: 1 | 2 | null
}

export interface BracketSpec {
  bracketSize: number
  rounds: number[]           // e.g. [4, 2, 1] for 8-team
  matches: BracketMatchSpec[]
  thirdPlaceMatch: BracketMatchSpec | null
}

// ── Math helpers ──────────────────────────────────────────────────────────────

export function nextPowerOf2(n: number): number {
  if (n <= 1) return 1
  return Math.pow(2, Math.ceil(Math.log2(n)))
}

export function getRoundName(roundNumber: number, bracketSize: number): string {
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
  // roundNumber = bracketSize/2 for the first playable round
  // (for 8-team: roundNumber=4; for 4-team: roundNumber=2)
  const firstRound = bracketSize / 2
  const pairings = generateFirstRoundPairings(bracketSize)

  // Determine which seed numbers are byes (highest seeds get byes)
  // Seeds > teamsAdvancing are "virtual" — paired with real teams who get byes
  const byeSeeds = new Set<number>()
  for (let i = teamsAdvancing + 1; i <= bracketSize; i++) byeSeeds.add(i)

  for (let i = 0; i < pairings.length; i++) {
    const [s1, s2] = pairings[i]
    const matchNum = i + 1

    // Next round: pairs of consecutive matches feed the same semi match
    const nextRound = firstRound / 2
    const nextMatchNum = Math.ceil(matchNum / 2)
    const nextSlot: 1 | 2 = matchNum % 2 === 1 ? 1 : 2

    const isBye = byeSeeds.has(s2) // team2 is a virtual bye seed

    matches.push({
      roundNumber: firstRound,
      matchNumber: matchNum,
      team1Seed: s1 <= teamsAdvancing ? s1 : null,
      team2Seed: isBye ? null : (s2 <= teamsAdvancing ? s2 : null),
      isBye,
      winnerToMatchNumber: nextRound >= 1 ? nextMatchNum : null,
      winnerToSlot: nextRound >= 1 ? nextSlot : null,
      loserToMatchNumber: null,
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
        winnerToMatchNumber: nextRound >= 1 ? nextMatchNum : null,
        winnerToSlot: nextRound >= 1 ? nextSlot : null,
        loserToMatchNumber: thirdPlaceGame && round === 2 ? 2 : null,
        loserToSlot: thirdPlaceGame && round === 2 ? (m === 1 ? 1 : 2) : null,
      })
    }
  }

  // ── Final ─────────────────────────────────────────────────────────────────
  matches.push({
    roundNumber: 1,
    matchNumber: 1,
    team1Seed: null,
    team2Seed: null,
    isBye: false,
    winnerToMatchNumber: null,
    winnerToSlot: null,
    loserToMatchNumber: thirdPlaceGame ? 2 : null,
    loserToSlot: thirdPlaceGame ? null : null,
  })

  // ── Third place ───────────────────────────────────────────────────────────
  let thirdPlaceMatch: BracketMatchSpec | null = null
  if (thirdPlaceGame) {
    thirdPlaceMatch = {
      roundNumber: 1,
      matchNumber: 2,
      team1Seed: null,
      team2Seed: null,
      isBye: false,
      winnerToMatchNumber: null,
      winnerToSlot: null,
      loserToMatchNumber: null,
      loserToSlot: null,
    }
  }

  return { bracketSize, rounds, matches, thirdPlaceMatch }
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
