/**
 * Milestones: progress that isn't winning. Medals reward the few who win;
 * these reward everyone who keeps showing up — events joined, games played,
 * drop-in sessions, teammates met, years with the club.
 *
 * DERIVED, never stored: the counts come from records that already exist
 * (getPlayerCareer loads them into `career.milestoneStats`), so a milestone
 * can't drift from the history it describes. Which ones a player has already
 * SEEN is the browser's business (the dashboard celebrates each once).
 *
 * "Games" are the games the player's team played while they were on it — the
 * app records RSVPs, not per-game attendance — so the copy says "games with
 * your team", never "games you attended". Pure; tested in milestones.test.ts.
 */

export type MilestoneKind = 'events' | 'games' | 'sessions' | 'teammates' | 'years'

export interface MilestoneStats {
  /** Events (leagues, tournaments, drop-in series) the player joined. */
  events: number
  /** Confirmed games their team played while they were on the roster. */
  games: number
  /** Past drop-in sessions they were signed up for (not cancelled). */
  sessions: number
  /** Different people they've shared a team with. */
  teammates: number
  /** Different calendar years they played in. */
  years: number
}

export const EMPTY_MILESTONE_STATS: MilestoneStats = { events: 0, games: 0, sessions: 0, teammates: 0, years: 0 }

export interface Milestone {
  /** Stable key — "games:25". The dashboard remembers which it has celebrated. */
  id: string
  kind: MilestoneKind
  threshold: number
  icon: string
  /** Short chip text: "25 games". */
  title: string
  /** Sentence for the celebration: "25 games with your team at Kaboom." */
  description: string
}

/** The ladders. The first rung is deliberately low so a new player gets one early. */
export const LADDERS: Record<MilestoneKind, number[]> = {
  events: [1, 3, 5, 10, 25, 50],
  games: [10, 25, 50, 100, 250, 500],
  sessions: [5, 10, 25, 50, 100, 250],
  teammates: [10, 25, 50, 100, 250],
  years: [2, 3, 5, 10],
}

const ICON: Record<MilestoneKind, string> = {
  events: '🎟️', games: '🔥', sessions: '👟', teammates: '🤝', years: '⭐',
}

/** Order milestones are listed in (and, on a tie, which one gets celebrated). */
const KIND_ORDER: MilestoneKind[] = ['years', 'games', 'events', 'sessions', 'teammates']

function describe(kind: MilestoneKind, n: number, orgName: string): { title: string; description: string } {
  switch (kind) {
    case 'events':
      return n === 1
        ? { title: 'First event', description: `Your first event with ${orgName}. Welcome!` }
        : { title: `${n} events`, description: `You've joined ${n} events with ${orgName}.` }
    case 'games':
      return { title: `${n} games`, description: `${n} games with your team at ${orgName}.` }
    case 'sessions':
      return { title: `${n} drop-ins`, description: `You've come out to ${n} drop-in sessions.` }
    case 'teammates':
      return { title: `${n} teammates`, description: `You've played alongside ${n} different teammates.` }
    case 'years':
      return { title: `${n} years`, description: `${n} years playing with ${orgName}.` }
  }
}

function milestone(kind: MilestoneKind, threshold: number, orgName: string): Milestone {
  return { id: `${kind}:${threshold}`, kind, threshold, icon: ICON[kind], ...describe(kind, threshold, orgName) }
}

/** Every milestone reached, in display order (by kind, then threshold). */
export function milestonesReached(stats: MilestoneStats, orgName = 'the club'): Milestone[] {
  const out: Milestone[] = []
  for (const kind of KIND_ORDER) {
    for (const t of LADDERS[kind]) if ((stats[kind] ?? 0) >= t) out.push(milestone(kind, t, orgName))
  }
  return out
}

/** The highest reached rung of each kind — the badges worth showing. */
export function topMilestones(stats: MilestoneStats, orgName = 'the club'): Milestone[] {
  const top = new Map<MilestoneKind, Milestone>()
  for (const m of milestonesReached(stats, orgName)) top.set(m.kind, m)
  return KIND_ORDER.map((k) => top.get(k)).filter((m): m is Milestone => !!m)
}

export interface NextMilestone {
  milestone: Milestone
  current: number
  remaining: number
  /** 0–1 from the previous rung (or 0) to this one. */
  progress: number
  /** "8 more games to 50". */
  hint: string
}

const UNIT: Record<MilestoneKind, [string, string]> = {
  events: ['event', 'events'],
  games: ['game', 'games'],
  sessions: ['drop-in', 'drop-ins'],
  teammates: ['teammate', 'teammates'],
  years: ['year', 'years'],
}

/**
 * The goal worth showing next: of each kind's next rung, the one the player is
 * proportionally closest to. Kinds the player has never touched (no drop-ins
 * at all) are skipped — "0 of 5 drop-ins" isn't encouragement. Years are
 * skipped too (nobody can hurry a calendar).
 */
export function nextMilestone(stats: MilestoneStats, orgName = 'the club'): NextMilestone | null {
  let best: NextMilestone | null = null
  for (const kind of KIND_ORDER) {
    if (kind === 'years') continue
    const current = stats[kind] ?? 0
    if (current <= 0) continue
    const ladder = LADDERS[kind]
    const next = ladder.find((t) => t > current)
    if (next == null) continue
    const prev = [...ladder].reverse().find((t) => t <= current) ?? 0
    const progress = (current - prev) / (next - prev)
    const remaining = next - current
    const [one, many] = UNIT[kind]
    const candidate: NextMilestone = {
      milestone: milestone(kind, next, orgName),
      current,
      remaining,
      progress,
      hint: `${remaining} more ${remaining === 1 ? one : many} to ${next}`,
    }
    if (!best || candidate.progress > best.progress) best = candidate
  }
  return best
}

/**
 * Which reached milestones to celebrate now, given the ids already celebrated
 * on this device. `seen === null` means this device has never recorded any:
 * a long-time player opening the feature for the first time gets ONE
 * celebration (their biggest milestone), not a dozen in a row.
 */
export function milestonesToCelebrate(reached: Milestone[], seen: Set<string> | null): Milestone[] {
  const fresh = seen ? reached.filter((m) => !seen.has(m.id)) : reached
  if (fresh.length === 0) return []
  // Biggest first: the highest rung of the kind listed first, then the rest.
  const ranked = [...fresh].sort((a, b) =>
    (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) || (b.threshold - a.threshold))
  if (!seen) {
    // First time: just the single most impressive one (highest rung relative to its ladder).
    const score = (m: Milestone) => LADDERS[m.kind].indexOf(m.threshold) / LADDERS[m.kind].length
    return [[...fresh].sort((a, b) => score(b) - score(a) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))[0]]
  }
  // At most one per kind (passing 10 AND 25 games at once is one moment), max 3.
  const perKind = new Map<MilestoneKind, Milestone>()
  for (const m of ranked) if (!perKind.has(m.kind)) perKind.set(m.kind, m)
  return [...perKind.values()].slice(0, 3)
}
