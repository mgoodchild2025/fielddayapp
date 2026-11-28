/**
 * Rivalries: two teams' all-time record against each other, across seasons.
 * Teams are rows per event, so "the same team" next season is matched by NAME
 * (normalizeTeamName — case, spaces, curly quotes ignored), the same way the
 * Hall of Champions' Dynasties board counts titles. Pure; tested in
 * rivalry.test.ts. Loading is in lib/rivalry-load.ts.
 */

export interface Meeting {
  at: string
  /** Scores from side A's point of view; null for a playoff match advanced without a score. */
  a: number | null
  b: number | null
  /** Who won, from A's side — needed when there are no scores. */
  outcome: 'W' | 'L' | 'T'
  eventId: string
  eventName: string
}

export interface Rivalry {
  aWins: number
  bWins: number
  ties: number
  meetings: number
  /** Distinct events (seasons, tournaments) they've met in. */
  events: number
  sinceYear: number | null
  last: Meeting | null
  /** Who has won the most recent meetings in a row: 'a' | 'b', and how many (from 2). */
  run: { side: 'a' | 'b'; count: number } | null
}

export function buildRivalry(meetings: Meeting[], yearOf: (iso: string) => number): Rivalry {
  const sorted = [...meetings].sort((x, y) => x.at.localeCompare(y.at))
  let aWins = 0, bWins = 0, ties = 0
  for (const m of sorted) {
    if (m.outcome === 'W') aWins++
    else if (m.outcome === 'L') bWins++
    else ties++
  }
  let run: Rivalry['run'] = null
  const lastOutcome = sorted[sorted.length - 1]?.outcome
  if (lastOutcome && lastOutcome !== 'T') {
    let count = 0
    for (let i = sorted.length - 1; i >= 0 && sorted[i].outcome === lastOutcome; i--) count++
    if (count >= 2) run = { side: lastOutcome === 'W' ? 'a' : 'b', count }
  }
  return {
    aWins, bWins, ties,
    meetings: sorted.length,
    events: new Set(sorted.map((m) => m.eventId)).size,
    sinceYear: sorted[0] ? yearOf(sorted[0].at) : null,
    last: sorted[sorted.length - 1] ?? null,
    run,
  }
}

/** "4–2" or "4–2–1" from A's side. */
export function rivalryRecord(r: Pick<Rivalry, 'aWins' | 'bWins' | 'ties'>): string {
  return r.ties > 0 ? `${r.aWins}–${r.bWins}–${r.ties}` : `${r.aWins}–${r.bWins}`
}

/**
 * Worth showing as a rivalry only when they've met in more than one event —
 * a single event's meetings are already the page's head-to-head.
 */
export function isRivalry(r: Rivalry): boolean {
  return r.events >= 2
}

/** Escape a value for a PostgREST ilike pattern (exact, case-insensitive). */
export function ilikeExact(name: string): string {
  return name.trim().replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Placeholder names ("Team 1", "Team A", "T3") repeat every season without being the same team. */
export function isGenericTeamName(name: string): boolean {
  return /^(team\s*)?[a-z0-9]{1,2}$/i.test(name.trim()) || /^(home|away|tbd|bye)$/i.test(name.trim())
}
