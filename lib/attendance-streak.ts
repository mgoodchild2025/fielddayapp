/**
 * Attendance streaks: "You've played 8 weeks in a row 🔥".
 *
 * The app records RSVPs and drop-in sign-ups, not who actually turned up, so
 * a week counts as PLAYED when the player had a team game that week they
 * didn't RSVP "out" of, or signed up for a drop-in session that week. A week
 * is MISSED when they had something to play (a team game, or a session of a
 * drop-in event they play) and did none of it. Weeks with nothing on their
 * calendar — a bye week, a holiday, the off-season — are skipped, so a
 * streak means "every week you could play, you did". Weeks start Monday in
 * the org's timezone. A streak whose last played week is more than two weeks
 * back is over (the season ended, they stopped coming). Pure; tested in attendance-streak.test.ts.
 */

export interface Activity {
  at: string
  /** Team game not RSVP'd out, or a drop-in session they signed up for. */
  attended: boolean
}

export interface AttendanceStreak {
  /** Weeks in a row played, ending at the last finished week (or this week if already played). */
  weeks: number
  /** This week is already played (counted in `weeks`). */
  thisWeekPlayed: boolean
  /** The player has something still to come this week that would extend the streak. */
  thisWeekPending: boolean
}

/** Monday (YYYY-MM-DD) of the org-local week containing `iso`. */
export function weekOf(iso: string, timeZone: string): string {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const d = new Date(`${local}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

function shiftWeek(week: string, n: number): string {
  const d = new Date(`${week}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 7 * n)
  return d.toISOString().slice(0, 10)
}

export function attendanceStreak(activities: Activity[], nowMs: number, timeZone: string): AttendanceStreak {
  const nowIso = new Date(nowMs).toISOString()
  const thisWeek = weekOf(nowIso, timeZone)
  const weeks = new Map<string, 'played' | 'missed'>()
  let thisWeekPending = false
  for (const a of activities) {
    const t = new Date(a.at).getTime()
    if (!Number.isFinite(t)) continue
    const w = weekOf(a.at, timeZone)
    if (t > nowMs) {
      if (w === thisWeek && a.attended) thisWeekPending = true
      continue
    }
    if (a.attended) weeks.set(w, 'played')
    else if (!weeks.has(w)) weeks.set(w, 'missed')
  }
  const thisWeekPlayed = weeks.get(thisWeek) === 'played'
  // This week only breaks nothing until it's over: a miss so far still has days left.
  if (weeks.get(thisWeek) === 'missed') weeks.delete(thisWeek)

  let count = 0
  const ordered = [...weeks.keys()].sort().reverse()
  for (const w of ordered) {
    if (weeks.get(w) !== 'played') break
    count++
  }
  // Only a live streak: nothing played in the last two weeks (season over,
  // stopped coming) means it's history, not "in a row".
  if (count > 0 && ordered[0] < shiftWeek(thisWeek, -2)) count = 0
  return { weeks: count, thisWeekPlayed, thisWeekPending: thisWeekPending && !thisWeekPlayed }
}

/** Worth showing from 3 weeks: two weeks running is just a schedule. */
export const STREAK_MIN_WEEKS = 3

/**
 * The line on the dashboard, or null. With a game still to come this week and
 * no "I'm in" yet it asks; once they're in it looks ahead to the next week.
 */
export function streakLine(s: AttendanceStreak, opts: { nextDay?: string | null; rsvpIn?: boolean } = {}): string | null {
  if (s.weeks < STREAK_MIN_WEEKS) return null
  const base = `You've played ${s.weeks} weeks in a row 🔥`
  if (s.thisWeekPending && opts.nextDay) {
    return opts.rsvpIn ? `${base} Week ${s.weeks + 1} is ${opts.nextDay}.` : `${base} Keep it going: you in for ${opts.nextDay}?`
  }
  return base
}
