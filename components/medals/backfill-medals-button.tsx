'use client'

import { useState, useTransition } from 'react'
import { backfillOrgMedals } from '@/actions/medals'

/**
 * One-time backfill: awards medals for every already-completed event, so
 * long-tenured champions wake up to full trophy cases. Idempotent — safe to
 * re-run any time.
 */
export function BackfillMedalsButton() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-gray-500">{result}</span>}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const r = await backfillOrgMedals()
            if (r.error) { setResult(r.error); return }
            setResult(r.awarded > 0
              ? `🏅 ${r.awarded} medal${r.awarded !== 1 ? 's' : ''} across ${r.events} event${r.events !== 1 ? 's' : ''}`
              : 'No completed playoff results found to award.')
          })
        }
        className="text-sm text-gray-500 hover:text-gray-700 border rounded-md px-3 py-2 bg-white disabled:opacity-50"
        title="Award medals for every completed event's playoff results — safe to re-run"
      >
        {isPending ? 'Awarding…' : '🏅 Award past medals'}
      </button>
    </div>
  )
}
