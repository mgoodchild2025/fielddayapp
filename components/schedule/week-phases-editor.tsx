'use client'

import { useState, useTransition } from 'react'
import { setWeekPhase } from '@/actions/phases'
import { PHASE_ORDER, PHASE_LABELS, type SchedulePhase } from '@/lib/phases'

/**
 * Admin editor for per-week schedule phases. Weeks are seeded from the schedule
 * (max game week) plus any weeks that already have a phase; admins can append
 * further weeks to declare phases before matchups exist.
 */
export function WeekPhasesEditor({
  leagueId,
  initialPhases,
  maxGameWeek,
}: {
  leagueId: string
  initialPhases: { week_number: number; phase: SchedulePhase }[]
  maxGameWeek: number
}) {
  const [phases, setPhases] = useState<Record<number, SchedulePhase | ''>>(() => {
    const map: Record<number, SchedulePhase | ''> = {}
    for (const p of initialPhases) map[p.week_number] = p.phase
    return map
  })

  const seededMax = Math.max(
    maxGameWeek,
    ...initialPhases.map((p) => p.week_number),
    0,
  )
  const [weekCount, setWeekCount] = useState(Math.max(seededMax, 1))
  const [isPending, startTransition] = useTransition()

  const weeks = Array.from({ length: weekCount }, (_, i) => i + 1)

  function handleChange(week: number, value: SchedulePhase | '') {
    setPhases((prev) => ({ ...prev, [week]: value }))
    startTransition(async () => {
      await setWeekPhase(leagueId, week, value === '' ? null : value)
    })
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-sm font-semibold mb-1">Season phases</p>
      <p className="text-xs text-gray-500 mb-3">
        Label each week so players know what to expect before matchups are set.
      </p>

      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {weeks.map((week) => (
          <div key={week} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-14 shrink-0">Week {week}</span>
            <select
              value={phases[week] ?? ''}
              disabled={isPending}
              onChange={(e) => handleChange(week, e.target.value as SchedulePhase | '')}
              className="flex-1 border rounded-md px-2 py-1 text-xs focus:outline-none disabled:opacity-50"
            >
              <option value="">—</option>
              {PHASE_ORDER.map((p) => (
                <option key={p} value={p}>{PHASE_LABELS[p]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setWeekCount((n) => n + 1)}
        className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        + Add week {weekCount + 1}
      </button>
    </div>
  )
}
