import { PHASE_LABELS, PHASE_BADGE_CLASSES, phaseRanges, type SchedulePhase } from '@/lib/phases'

/**
 * A one-line summary of the season structure, e.g.
 * "Regular Season · Wk 1–8   Pool Play · Wk 9–10   Playoffs · Wk 11–12".
 * Rendered at the top of the schedule so players know what to expect even
 * before matchups are set.
 */
export function SchedulePhaseSummary({
  weekPhases,
  className = '',
}: {
  weekPhases: { week_number: number; phase: SchedulePhase }[]
  className?: string
}) {
  if (weekPhases.length === 0) return null
  const ranges = phaseRanges(weekPhases)

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {ranges.map((r, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${PHASE_BADGE_CLASSES[r.phase]}`}
        >
          {PHASE_LABELS[r.phase]}
          <span className="font-normal opacity-70">
            {r.start === r.end ? `Wk ${r.start}` : `Wk ${r.start}–${r.end}`}
          </span>
        </span>
      ))}
    </div>
  )
}
