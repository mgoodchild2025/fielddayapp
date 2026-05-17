import { parseLocalToUtc } from '@/lib/format-time'

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
  /** Minutes per game — used to offset consecutive time slots within the same day when daysBetweenRounds = 0 */
  gameDurationMinutes?: number
  /** IANA timezone used to interpret startDate + gameTime correctly */
  timezone?: string
  /**
   * When true, team IDs beginning with "slot_" are treated as positional
   * placeholders — homeTeamId/awayTeamId are set to null and labels are
   * populated instead (e.g. "Team 1", "Team 2").
   */
  slotMode?: boolean
}

/** A named break that pauses scheduling when a time slot would land inside it. */
export interface SpecialBreak {
  label: string           // e.g. "Lunch"
  startTime: string       // HH:MM 24-hour, on the same calendar date as the first game
  durationMinutes: number
}

/** Options for day-schedule mode: all rounds in one day, advancing by clock time. */
export interface DayScheduleOptions {
  /** Local datetime string for the first game slot, "YYYY-MM-DDTHH:MM" */
  startDateTime: string
  /** Length of each game in minutes */
  gameDurationMinutes: number
  /** Gap between consecutive time slots in minutes */
  breakBetweenSlotsMinutes: number
  /**
   * How many games can run simultaneously (pipeline limiter).
   * A round with more games than courts spills into sequential slots.
   */
  courtsAvailable: number
  /** Named breaks — any slot that lands inside a break is pushed to its end. */
  specialBreaks?: SpecialBreak[]
  /** Same slot-mode semantics as ScheduleOptions.slotMode */
  slotMode?: boolean
}

export interface ScheduledGame {
  homeTeamId: string | null
  awayTeamId: string | null
  /** Populated in slotMode when homeTeamId is null */
  homeTeamLabel: string | null
  /** Populated in slotMode when awayTeamId is null */
  awayTeamLabel: string | null
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
  const isSlot = opts.slotMode
  const slotLabel = (id: string) => `Team ${id.replace('slot_', '')}`

  function pushGame(f: Fixture, scheduledAt: string, court: string | null) {
    const rawHome = f.homeTeamId ?? ''
    const rawAway = f.awayTeamId ?? ''
    const homeIsSlot = isSlot && rawHome.startsWith('slot_')
    const awayIsSlot = isSlot && rawAway.startsWith('slot_')
    games.push({
      homeTeamId: homeIsSlot ? null : (rawHome || null),
      awayTeamId: awayIsSlot ? null : (rawAway || null),
      homeTeamLabel: homeIsSlot ? slotLabel(rawHome) : null,
      awayTeamLabel: awayIsSlot ? slotLabel(rawAway) : null,
      scheduledAt,
      weekNumber: f.round,
      court,
    })
  }

  const tz = opts.timezone ?? 'UTC'
  const gameDurationMs = Math.max(1, opts.gameDurationMinutes ?? 60) * 60_000

  function offsetDate(days: number): string {
    const d = new Date(opts.startDate)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }

  // Group by round, preserving round structure.
  const byRound = new Map<number, Fixture[]>()
  for (const f of fixtures) {
    if (!byRound.has(f.round)) byRound.set(f.round, [])
    byRound.get(f.round)!.push(f)
  }

  if (opts.daysBetweenRounds === 0) {
    // Same-day mode: all rounds on the start date, each slot advances by gameDuration.
    // Courts caps how many games are scheduled per round — extras are skipped.
    const baseMs = new Date(parseLocalToUtc(opts.startDate, opts.gameTime, tz)).getTime()
    let offsetMs = 0
    for (const [, roundFixtures] of byRound) {
      const toPlay = roundFixtures.slice(0, courts)
      const scheduledAt = new Date(baseMs + offsetMs).toISOString()
      toPlay.forEach((f, courtIdx) => {
        const court = courts > 1 ? `Court ${courtIdx + 1}` : null
        pushGame(f, scheduledAt, court)
      })
      offsetMs += gameDurationMs
    }
  } else {
    // Multi-day mode: round r starts on day (r-1) * daysBetweenRounds.
    // Courts caps games per round here too.
    for (const [round, roundFixtures] of byRound) {
      const dateStr = offsetDate((round - 1) * opts.daysBetweenRounds)
      const scheduledAt = parseLocalToUtc(dateStr, opts.gameTime, tz)
      roundFixtures.slice(0, courts).forEach((f, i) => {
        const court = courts > 1 ? `Court ${i + 1}` : null
        pushGame(f, scheduledAt, court)
      })
    }
  }

  return games
}

// ── Day-schedule mode ─────────────────────────────────────────────────────────

/**
 * Advance `time` past any special breaks it falls inside.
 * Iterates until stable (handles back-to-back breaks, unlikely in practice).
 */
function advancePastBreaks(time: Date, breaks: SpecialBreak[]): Date {
  let result = new Date(time)
  let changed = true
  while (changed) {
    changed = false
    for (const br of breaks) {
      const [h, m] = br.startTime.split(':').map(Number)
      // Resolve break start against the current result's calendar date
      const breakStart = new Date(result)
      breakStart.setHours(h, m, 0, 0)
      const breakEnd = new Date(breakStart.getTime() + br.durationMinutes * 60_000)
      if (result >= breakStart && result < breakEnd) {
        result = new Date(breakEnd)
        changed = true
        break
      }
    }
  }
  return result
}

/**
 * Day-schedule variant of assignDates.
 * Rounds are collapsed into time slots: up to `courtsAvailable` games per slot,
 * each slot separated by gameDuration + breakBetweenSlots minutes.
 * Special breaks push any slot that lands inside them to the break's end.
 */
export function assignTimeSlots(fixtures: Fixture[], opts: DayScheduleOptions): ScheduledGame[] {
  const games: ScheduledGame[] = []
  const courts = Math.max(1, opts.courtsAvailable)
  const slotGapMs = (opts.gameDurationMinutes + opts.breakBetweenSlotsMinutes) * 60_000

  // Parse local datetime string ("YYYY-MM-DDTHH:MM") as a local Date
  const startDt = new Date(opts.startDateTime)

  // Group fixtures by round, preserving round order
  const byRound = new Map<number, Fixture[]>()
  for (const f of fixtures) {
    if (!byRound.has(f.round)) byRound.set(f.round, [])
    byRound.get(f.round)!.push(f)
  }

  // Flatten rounds → batches (each batch ≤ courts games, run simultaneously)
  const batches: { fixtures: Fixture[]; roundNum: number }[] = []
  for (const [roundNum, roundFixtures] of byRound) {
    for (let i = 0; i < roundFixtures.length; i += courts) {
      batches.push({ fixtures: roundFixtures.slice(i, i + courts), roundNum })
    }
  }

  const slotLabel = (id: string) => `Team ${id.replace('slot_', '')}`
  let currentTime = new Date(startDt)

  for (const batch of batches) {
    const slotIso = currentTime.toISOString()

    batch.fixtures.forEach((f, i) => {
      const courtLabel = courts > 1 ? `Court ${i + 1}` : null
      const rawHome = f.homeTeamId ?? ''
      const rawAway = f.awayTeamId ?? ''
      const homeIsSlot = opts.slotMode && rawHome.startsWith('slot_')
      const awayIsSlot = opts.slotMode && rawAway.startsWith('slot_')
      games.push({
        homeTeamId:    homeIsSlot ? null : (rawHome || null),
        awayTeamId:    awayIsSlot ? null : (rawAway || null),
        homeTeamLabel: homeIsSlot ? slotLabel(rawHome) : null,
        awayTeamLabel: awayIsSlot ? slotLabel(rawAway) : null,
        scheduledAt: slotIso,
        weekNumber: batch.roundNum,
        court: courtLabel,
      })
    })

    // Advance and skip over any special breaks
    const rawNext = new Date(currentTime.getTime() + slotGapMs)
    currentTime = advancePastBreaks(rawNext, opts.specialBreaks ?? [])
  }

  return games
}

// ── Weekly league / pickup scheduler ─────────────────────────────────────────

/**
 * Return every calendar date between startDate and endDate (inclusive)
 * whose day-of-week is in daysOfWeek (0=Sun … 6=Sat).
 * Dates are constructed at local noon to avoid DST-midnight edge cases.
 */
export function getGameDays(
  startDate: string,    // YYYY-MM-DD
  endDate: string,      // YYYY-MM-DD
  daysOfWeek: number[], // 0=Sun … 6=Sat
): Date[] {
  const result: Date[] = []
  if (!daysOfWeek.length) return result
  const dowSet = new Set(daysOfWeek)
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const cursor = new Date(sy, sm - 1, sd, 12, 0, 0)
  const end    = new Date(ey, em - 1, ed, 12, 0, 0)
  while (cursor <= end) {
    if (dowSet.has(cursor.getDay())) {
      result.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()))
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

export interface WeeklySlotsOptions {
  timezone: string           // IANA
  timeSlots: string[]        // HH:MM local, e.g. ['19:00', '20:15']
  courts: number             // simultaneous courts per time slot
  gameDurationMinutes: number
  repeatRotations: boolean
  slotMode?: boolean
}

/**
 * Assign fixtures to game days using a weekly schedule format.
 * Iterates gameDays × timeSlots × courts sequentially, drawing one fixture per slot.
 * When repeatRotations=true, wraps back to fixture 0 after the last fixture.
 */
export function assignWeeklySlots(
  fixtures: Fixture[],
  gameDays: Date[],
  opts: WeeklySlotsOptions,
): ScheduledGame[] {
  const { timezone, timeSlots, courts, repeatRotations, slotMode } = opts
  const games: ScheduledGame[] = []
  if (!fixtures.length || !gameDays.length || !timeSlots.length || courts < 1) return games

  const slotLabel = (id: string) => `Team ${id.replace('slot_', '')}`
  let fixtureIndex = 0

  outer: for (const day of gameDays) {
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    for (const slot of timeSlots) {
      for (let c = 0; c < courts; c++) {
        if (fixtureIndex >= fixtures.length) {
          if (!repeatRotations) break outer
          fixtureIndex = 0
        }
        const f = fixtures[fixtureIndex++]
        const rawHome = f.homeTeamId ?? ''
        const rawAway = f.awayTeamId ?? ''
        const homeIsSlot = !!slotMode && rawHome.startsWith('slot_')
        const awayIsSlot = !!slotMode && rawAway.startsWith('slot_')
        games.push({
          homeTeamId:    homeIsSlot ? null : (rawHome || null),
          awayTeamId:    awayIsSlot ? null : (rawAway || null),
          homeTeamLabel: homeIsSlot ? slotLabel(rawHome) : null,
          awayTeamLabel: awayIsSlot ? slotLabel(rawAway) : null,
          scheduledAt:   parseLocalToUtc(dateStr, slot, timezone),
          weekNumber:    f.round,
          court:         courts > 1 ? `Court ${c + 1}` : null,
        })
      }
    }
  }
  return games
}

/**
 * Generate blank pickup/drop-in time slots with no team assignments.
 */
export function generatePickupSlotList(
  gameDays: Date[],
  timeSlots: string[],
  courts: number,
  timezone: string,
): ScheduledGame[] {
  const games: ScheduledGame[] = []
  for (const day of gameDays) {
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    for (const slot of timeSlots) {
      for (let c = 0; c < courts; c++) {
        games.push({
          homeTeamId:    null,
          awayTeamId:    null,
          homeTeamLabel: null,
          awayTeamLabel: null,
          scheduledAt:   parseLocalToUtc(dateStr, slot, timezone),
          weekNumber:    1,
          court:         courts > 1 ? `Court ${c + 1}` : null,
        })
      }
    }
  }
  return games
}
