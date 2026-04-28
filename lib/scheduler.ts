/**
 * Round-robin tournament scheduler.
 * Uses the "circle method" (polygon algorithm) to generate fixtures.
 * Each team plays every other team once per round.
 * With an odd number of teams, one team has a "bye" each round.
 */
export interface Team {
  id: string
  name: string
}

export interface Fixture {
  homeTeamId: string | null
  awayTeamId: string | null
  round: number
}

/**
 * Generates a single round-robin fixture list for the given teams.
 * Returns an array of { homeTeamId, awayTeamId, round } objects.
 */
export function generateRoundRobin(teams: Team[]): Fixture[] {
  if (teams.length < 2) return []

  const fixtures: Fixture[] = []
  const teamsCopy = [...teams]

  // Add a bye team for odd counts
  if (teamsCopy.length % 2 !== 0) {
    teamsCopy.push({ id: '__bye__', name: 'BYE' })
  }

  const n = teamsCopy.length
  const rounds = n - 1

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = teamsCopy[i]
      const away = teamsCopy[n - 1 - i]

      // Skip bye games
      if (home.id !== '__bye__' && away.id !== '__bye__') {
        fixtures.push({
          homeTeamId: home.id,
          awayTeamId: away.id,
          round,
        })
      }
    }

    // Rotate all teams except the first (fixed team)
    const last = teamsCopy.pop()!
    teamsCopy.splice(1, 0, last)
  }

  return fixtures
}

export interface ScheduleOptions {
  /** ISO date string for the first game */
  startDate: string
  /** Days between rounds (e.g. 7 for weekly) */
  daysBetweenRounds: number
  /** Default game start time HH:MM */
  gameTime: string
  /** Optional venue name */
  venue?: string
  /** Number of courts/fields; games per round are spread across courts */
  courts?: number
}

export interface ScheduledGame {
  homeTeamId: string
  awayTeamId: string
  scheduledAt: string
  weekNumber: number
  court: string | null
}

/**
 * Given a round-robin fixture list and schedule options, assigns dates to each fixture.
 */
export function assignDates(fixtures: Fixture[], opts: ScheduleOptions): ScheduledGame[] {
  const games: ScheduledGame[] = []
  const courts = Math.max(1, opts.courts ?? 1)
  const start = new Date(opts.startDate)
  const [hh, mm] = opts.gameTime.split(':').map(Number)

  // Group by round
  const byRound = new Map<number, Fixture[]>()
  for (const f of fixtures) {
    if (!byRound.has(f.round)) byRound.set(f.round, [])
    byRound.get(f.round)!.push(f)
  }

  for (const [round, roundFixtures] of byRound) {
    const roundDate = new Date(start)
    roundDate.setDate(roundDate.getDate() + (round - 1) * opts.daysBetweenRounds)
    roundDate.setHours(hh, mm, 0, 0)

    roundFixtures.forEach((f, i) => {
      const court = courts > 1 ? `Court ${(i % courts) + 1}` : null
      games.push({
        homeTeamId: f.homeTeamId!,
        awayTeamId: f.awayTeamId!,
        scheduledAt: roundDate.toISOString(),
        weekNumber: round,
        court,
      })
    })
  }

  return games
}
