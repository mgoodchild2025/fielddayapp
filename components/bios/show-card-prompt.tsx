'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { setMyCardShown } from '@/actions/player-bios'
import { safeAction } from '@/lib/action-errors'
import { announce } from '@/lib/announce'
import { CardNudge } from './card-nudge'

/**
 * "Show your card on event screens?" — the one-tap prompt for a player whose
 * card is filled in but switched off (people fill in the card and miss the
 * switch). Showing stays the player's choice: nothing is turned on until they
 * tap Yes. "Not now" quiets it for 60 days on this device, and the profile
 * editor and the dashboard share that key, so one "Not now" covers both.
 */
export function ShowCardPrompt({ onShown, className = '' }: { onShown?: () => void; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  if (done) return null

  async function show() {
    setBusy(true)
    setError(null)
    const r = await safeAction(setMyCardShown(true))
    setBusy(false)
    if (r.error) { setError(r.error); return }
    setDone(true)
    announce('Your card is on')
    toast.success('Your card is on. It can appear on event screens, and its share link works for anyone.')
    onShown?.()
  }

  return (
    <CardNudge storageKey="fd-card-show-dismissed" className={`rounded-lg border border-brand-primary/30 bg-brand-primary/5 px-3 py-2.5 ${className}`}>
      <p className="text-sm font-semibold text-gray-900">Show your card on event screens?</p>
      <p className="mt-0.5 text-xs text-gray-600">
        Event TVs can rotate through player cards, and your card&rsquo;s share link opens for anyone. It&rsquo;s off until you say yes.
      </p>
      <button
        type="button"
        onClick={show}
        disabled={busy}
        className="press mt-2 min-h-10 px-4 rounded-md text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-60"
      >
        {busy ? 'Turning on…' : 'Yes, show my card'}
      </button>
      {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </CardNudge>
  )
}
