'use client'

import { useState } from 'react'
import Link from 'next/link'
import { saveMyCardBasics } from '@/actions/player-bios'
import { safeAction } from '@/lib/action-errors'
import { announce } from '@/lib/announce'

/**
 * Right after registering — the moment a player cares most — offer the two
 * card fields that take seconds: number and position. Optional, one Save,
 * "Not now" to skip; the photo is a link to the full editor afterwards.
 */
export function QuickCardForm({
  initialNumber,
  initialPosition,
  positions,
  needsPhoto,
}: {
  initialNumber: string
  initialPosition: string
  positions: string[]
  needsPhoto: boolean
}) {
  const [number, setNumber] = useState(initialNumber)
  const [position, setPosition] = useState(initialPosition)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'skipped'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (state === 'skipped') return null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setState('saving')
    const r = await safeAction(saveMyCardBasics({ jerseyNumber: number, position }))
    if (r.error) {
      setError(r.error)
      setState('idle')
      return
    }
    setState('saved')
    announce('Saved to your player card')
  }

  if (state === 'saved') {
    return (
      <div className="fd-result-in mt-8 rounded-xl border bg-white px-5 py-4 text-left">
        <p className="text-sm font-semibold text-gray-900">
          <span className="fd-check-pop inline-block text-emerald-600" aria-hidden="true">✓</span> Saved to your player card
        </p>
        {needsPhoto && (
          <Link href="/profile#bio" className="press mt-1 inline-flex items-center min-h-10 text-sm font-medium text-brand-ink hover:underline">
            Add a photo →
          </Link>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={save} className="mt-8 rounded-xl border bg-white px-5 py-4 text-left">
      <p className="text-sm font-semibold text-gray-900">Make your player card</p>
      <p className="mt-0.5 text-xs text-gray-500">Teammates see it when they tap your name on the roster. Optional.</p>
      <div className="mt-3 grid grid-cols-[6rem_1fr] gap-3">
        <label className="block text-xs font-medium text-gray-700">
          Number
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value.slice(0, 6))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="7"
            className="mt-1 w-full rounded-md border px-3 py-2 text-base"
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Position
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value.slice(0, 40))}
            list={positions.length > 0 ? 'quick-card-positions' : undefined}
            autoComplete="off"
            placeholder={positions[0] ?? 'e.g. Setter'}
            className="mt-1 w-full rounded-md border px-3 py-2 text-base"
          />
          {positions.length > 0 && (
            <datalist id="quick-card-positions">
              {positions.map((p) => <option key={p} value={p} />)}
            </datalist>
          )}
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={state === 'saving' || (!number.trim() && !position.trim())}
          className="press min-h-10 rounded-md bg-brand-primary px-4 text-sm font-semibold text-on-brand disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving…' : 'Save to my card'}
        </button>
        <button
          type="button"
          onClick={() => setState('skipped')}
          className="press min-h-10 px-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Not now
        </button>
      </div>
    </form>
  )
}
