'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { delayRemainingGames } from '@/actions/schedule'
import { delayRemainingBracketMatches } from '@/actions/brackets'

type Mode = 'games' | 'bracket'

interface Props {
  leagueId: string
  /** 'games' delays the regular schedule; 'bracket' delays playoff matches. */
  mode: Mode
}

const PRESETS = [10, 15, 30]

export function DelayScheduleControl({ leagueId, mode }: Props) {
  const router = useRouter()
  const [minutes, setMinutes] = useState(15)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null)
  const [confirming, setConfirming] = useState(false)

  const label = mode === 'bracket' ? 'playoff matches' : 'games'

  async function apply() {
    setLoading(true)
    setResult(null)
    const res = mode === 'bracket'
      ? await delayRemainingBracketMatches({ leagueId, minutes })
      : await delayRemainingGames({ leagueId, minutes })
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
      <h3 className="font-semibold mb-1 text-sm flex items-center gap-1.5">⏱️ Running Behind?</h3>
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
            className={`flex-1 py-1.5 rounded text-sm font-medium border transition-colors ${
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
          className="w-20 border rounded px-2 py-1 text-sm"
        />
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => { setConfirming(true); setResult(null) }}
          disabled={minutes <= 0}
          className="w-full py-2 rounded text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
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
              className="flex-1 py-2 rounded text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {loading ? 'Applying…' : 'Confirm delay'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-3 py-2 rounded text-sm font-medium border text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
