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
