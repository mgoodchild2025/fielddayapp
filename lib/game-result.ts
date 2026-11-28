/**
 * The post-game moment: what a player is told when their game's result is
 * confirmed, and the numbers on their shareable result card. Pure; tested in
 * game-result.test.ts. Sending lives in lib/game-result-alerts.ts.
 */

export type Outcome = 'W' | 'L' | 'T'

/** The outcome for one side. Scores are sets won for set sports (the stored convention). */
export function outcomeFor(myScore: number, theirScore: number): Outcome {
  return myScore > theirScore ? 'W' : myScore < theirScore ? 'L' : 'T'
}

/** Wins in a row at the END of a team's results (oldest first). */
export function winStreak(outcomes: Outcome[]): number {
  let n = 0
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i] === 'W'; i--) n++
  return n
}

export interface ResultAlertInput {
  outcome: Outcome
  myScore: number
  theirScore: number
  opponent: string
  /** Wins in a row including this one (0 unless it was a win). */
  streak: number
  /** Set sports: per-set points from MY side, e.g. [{my:25,their:20}]. */
  sets?: { my: number; their: number }[] | null
}

/** "25–20, 25–18" from my side. */
export function setLine(sets: { my: number; their: number }[] | null | undefined): string | null {
  if (!sets || sets.length === 0) return null
  return sets.map((s) => `${s.my}–${s.their}`).join(', ')
}

/**
 * The alert. Wins are celebrated (streaks called out from 2); losses and ties
 * stay warm and short — the point is the player feels good opening the app,
 * never rubbed in it.
 */
export function resultAlert(r: ResultAlertInput): { title: string; body: string } {
  const score = `${r.myScore}–${r.theirScore}`
  const sets = setLine(r.sets)
  const setsPart = sets ? ` (${sets})` : ''
  if (r.outcome === 'W') {
    return {
      title: `W ${score} vs ${r.opponent} 🎉`,
      body: r.streak >= 2
        ? `That's ${r.streak} wins in a row 🔥${setsPart ? ` Sets${setsPart}.` : ''} Tap for your result card.`
        : `Nice win!${setsPart ? ` Sets${setsPart}.` : ''} Tap for your result card.`,
    }
  }
  if (r.outcome === 'T') {
    return { title: `Tie ${score} vs ${r.opponent}`, body: `All square${setsPart}. Good game!` }
  }
  return { title: `${score} vs ${r.opponent}`, body: `Good battle${setsPart}. On to the next one 💪` }
}

/** The big word on the result card. */
export function cardHeadline(outcome: Outcome): string {
  return outcome === 'W' ? 'WIN' : outcome === 'T' ? 'TIE' : 'FINAL'
}

/** "3 WINS IN A ROW" — only for real streaks. */
export function streakLabel(streak: number): string | null {
  return streak >= 2 ? `${streak} WINS IN A ROW` : null
}

/**
 * Alerts only for a result confirmed close to when it was played: an organiser
 * catching up on last month's scores shouldn't ping everyone about old games.
 */
export const RESULT_ALERT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export function isFreshResult(scheduledAt: string | null, nowMs: number): boolean {
  if (!scheduledAt) return false
  const t = new Date(scheduledAt).getTime()
  return Number.isFinite(t) && nowMs - t <= RESULT_ALERT_WINDOW_MS && t - nowMs <= 12 * 60 * 60 * 1000
}

/**
 * One alert per team per night: a team that plays three games tonight hears
 * once, after its last result of the day is in. Pure pieces; the sending is in
 * lib/game-result-alerts.ts.
 */
export interface NightResult {
  outcome: Outcome
  /** Null for a playoff match an organiser advanced without a score. */
  my: number | null
  their: number | null
  opponent: string
}

/** Still playing tonight: any of the team's games/matches today without a final result. */
export function nightStillPlaying(items: { done: boolean }[]): boolean {
  return items.some((i) => !i.done)
}

/** "W 21–18 vs Net Results" / "W vs Net Results" (advanced without a score). */
export function nightResultLine(r: NightResult): string {
  const word = r.outcome === 'T' ? 'Tie' : r.outcome
  return r.my == null || r.their == null ? `${word} vs ${r.opponent}` : `${word} ${r.my}–${r.their} vs ${r.opponent}`
}

/**
 * The alert for a night of two or more results (one result uses resultAlert):
 * "2–1 tonight 🎉" with every result in order. A good night is celebrated; a
 * tough one stays warm.
 */
export function nightAlert(results: NightResult[], streak: number): { title: string; body: string } {
  const w = results.filter((r) => r.outcome === 'W').length
  const l = results.filter((r) => r.outcome === 'L').length
  const t = results.length - w - l
  const record = t > 0 ? `${w}–${l}–${t}` : `${w}–${l}`
  const lines = results.map(nightResultLine).join(' · ')
  const tail = streak >= 2 ? ` That's ${streak} wins in a row 🔥` : w > l ? '' : w > 0 ? ' Good night out 💪' : ' Good battles. On to the next one 💪'
  return {
    title: w > l ? `${record} tonight 🎉` : `${record} tonight`,
    body: `${lines}.${tail}`,
  }
}

/** The org's calendar date (YYYY-MM-DD) of a time — the "night" a result belongs to. */
export function orgNight(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}
