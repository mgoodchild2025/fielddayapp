'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { delayRemainingGames } from '@/actions/schedule'
import { delayRemainingBracketMatches } from '@/actions/brackets'
import { Collapse } from '@/components/ui/collapse'
import { ChevronDown } from 'lucide-react'

type Mode = 'games' | 'bracket'

interface Props {
  leagueId: string
  /** 'games' delays the regular schedule; 'bracket' delays playoff matches. */
  mode: Mode
  /** Phones on game day: a one-line "Running behind?" bar above the schedule
   *  that opens the controls — the sidebar copy sits below every game. */
  collapsible?: boolean
}

const PRESETS = [10, 15, 30]

export function DelayScheduleControl({ leagueId, mode, collapsible = false }: Props) {
  const [expanded, setExpanded] = useState(!collapsible)
  const router = useRouter()
  const [minutes, setMinutes] = useState(15)
  const [notify, setNotify] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null)
  const [confirming, setConfirming] = useState(false)

  const label = mode === 'bracket' ? 'playoff matches' : 'games'

  async function apply() {
    setLoading(true)
    setResult(null)
    const res = mode === 'bracket'
      ? await delayRemainingBracketMatches({ leagueId, minutes, notify })
      : await delayRemainingGames({ leagueId, minutes, notify })
    setLoading(false)
    setConfirming(false)

    if (res.error) {
      setResult({ error: res.error })
    } else if (res.count === 0) {
      setResult({ error: `No remaining ${label} to delay today.` })
    } else {
      const noun = mode === 'bracket'
        ? (res.count === 1 ? 'match' : 'matches')
        : (res.count === 1 ? 'game' : 'games')
      const sample = res.sample ? ` (e.g. ${res.sample.from} → ${res.sample.to})` : ''
      setResult({ message: `${res.count} ${noun} pushed back ${minutes} min${sample}.` })
      router.refresh()
    }
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="press -m-4 p-4 w-[calc(100%+2rem)] min-h-12 flex items-center justify-between gap-2 text-left"
        >
          <span className="font-semibold text-sm flex items-center gap-1.5">⏱️ Running behind?</span>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      ) : (
        <h3 className="font-semibold mb-1 text-sm flex items-center gap-1.5">⏱️ Running Behind?</h3>
      )}
      <Collapse open={expanded}>
      <div className={collapsible ? 'pt-5' : undefined}>
      <p className="text-xs text-gray-500 mb-3">
        Push back all of today&apos;s remaining {label} by the same amount. Already-played and
        cancelled {label} are left untouched. All courts shift equally.
      </p>

      {result?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs mb-3">{result.error}</div>
      )}
      {result?.message && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs mb-3">{result.message}</div>
      )}

      {/* Preset buttons */}
      <div className="flex gap-2 mb-2">
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => { setMinutes(p); setConfirming(false) }}
            className={`press flex-1 min-h-10 rounded text-sm font-medium border ${
              minutes === p
                ? 'border-transparent text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            style={minutes === p ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            +{p}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-gray-500 shrink-0">Custom (min)</label>
        <input
          type="number"
          min={1}
          value={minutes}
          onChange={e => { setMinutes(Number(e.target.value)); setConfirming(false) }}
          inputMode="numeric"
          className="w-20 min-h-10 border rounded px-2 text-base sm:text-sm"
        />
      </div>

      {/* Notify teams */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={notify}
          onChange={e => setNotify(e.target.checked)}
          className="rounded border-gray-300"
        />
        <span className="text-xs text-gray-600">
          Notify affected teams of their new times (email + in-app)
        </span>
      </label>

      {!confirming ? (
        <button
          type="button"
          onClick={() => { setConfirming(true); setResult(null) }}
          disabled={minutes <= 0}
          className="press w-full min-h-11 rounded text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Delay remaining {label} by {minutes} min
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Push every remaining {label} today back <strong>{minutes} minutes</strong>?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={apply}
              disabled={loading}
              className="press flex-1 min-h-11 rounded text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {loading ? 'Applying…' : 'Confirm delay'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="press min-h-11 px-3 rounded text-sm font-medium border text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>
      </Collapse>
    </div>
  )
}
