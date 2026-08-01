/** Schedule phases declared per week so players know the season structure. */
export type SchedulePhase = 'regular_season' | 'pool_play' | 'playoffs'

export const PHASE_ORDER: SchedulePhase[] = ['regular_season', 'pool_play', 'playoffs']

export const PHASE_LABELS: Record<SchedulePhase, string> = {
  regular_season: 'Regular Season',
  pool_play: 'Pool Play',
  playoffs: 'Playoffs',
}

/** Badge/pill colour classes per phase (works on light surfaces). */
export const PHASE_BADGE_CLASSES: Record<SchedulePhase, string> = {
  regular_season: 'bg-slate-100 text-slate-600',
  pool_play: 'bg-indigo-50 text-indigo-700',
  playoffs: 'bg-amber-100 text-amber-800',
}

/**
 * Collapse a week→phase map into contiguous week ranges for a summary line,
 * e.g. [{phase:'regular_season', start:1, end:8}, {phase:'playoffs', start:11, end:12}].
 * Only consecutive weeks sharing the same phase are merged; gaps break a range.
 */
export function phaseRanges(
  weekPhases: { week_number: number; phase: SchedulePhase }[],
): { phase: SchedulePhase; start: number; end: number }[] {
  const sorted = [...weekPhases].sort((a, b) => a.week_number - b.week_number)
  const ranges: { phase: SchedulePhase; start: number; end: number }[] = []
  for (const w of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && last.phase === w.phase && w.week_number === last.end + 1) {
      last.end = w.week_number
    } else {
      ranges.push({ phase: w.phase, start: w.week_number, end: w.week_number })
    }
  }
  return ranges
}
