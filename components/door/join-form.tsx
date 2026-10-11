'use client'

import { useEffect, useState } from 'react'
import { DISPLAY_TYPE } from './door-stripes'

/** localStorage: this browser's pairing and the label it used last time. */
export const DOOR_DISPLAY_KEY = 'fieldday-door-display'
const DOOR_LABEL_KEY = 'fieldday-door-label'

export type SavedDisplay = { displayToken: string; stationName: string }

export function readSavedDisplay(): SavedDisplay | null {
  try {
    const raw = localStorage.getItem(DOOR_DISPLAY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed.displayToken === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function forgetSavedDisplay(displayToken?: string) {
  try {
    const saved = readSavedDisplay()
    if (!displayToken || saved?.displayToken === displayToken) localStorage.removeItem(DOOR_DISPLAY_KEY)
  } catch { /* storage blocked */ }
}

/**
 * Pair this device as a door display. With the staff QR's token it's one
 * field (the label) and JOIN; without, the 8-character code goes first.
 * No login and no admin by design.
 */
export function JoinForm({ joinToken, stationName }: { joinToken: string | null; stationName: string | null }) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Prefill the label this browser used before (after hydration).
  useEffect(() => {
    const t = setTimeout(() => {
      try { setLabel((l) => l || localStorage.getItem(DOOR_LABEL_KEY) || '') } catch { /* blocked */ }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  const ready = label.trim().length > 0 && (joinToken !== null || cleanCode.length === 8)

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/door/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(joinToken ? { joinToken, label } : { joinCode: cleanCode, label }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 201) {
        try {
          localStorage.setItem(DOOR_DISPLAY_KEY, JSON.stringify({ displayToken: body.displayToken, stationName: body.stationName }))
          localStorage.setItem(DOOR_LABEL_KEY, label.trim())
        } catch { /* the display URL still works; it just won't reopen from /door/display */ }
        window.location.replace(body.displayUrl)
        return
      }
      if (res.status === 429) {
        const mins = Math.max(1, Math.ceil((body.retryAfter ?? 900) / 60))
        setError(`Too many tries from this network. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`)
      } else if (res.status === 404) {
        setError(joinToken
          ? 'This join link no longer works. Ask an admin for the current staff card.'
          : 'That code didn’t match a door. Check it and try again.')
      } else {
        setError('Couldn’t join. Check your connection and try again.')
      }
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.')
    }
    setBusy(false)
  }

  return (
    <form onSubmit={join} className="flex flex-col gap-6" noValidate>
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-white/70">Door alert</p>
        <h1 className={`${DISPLAY_TYPE} text-5xl mt-1`}>
          {stationName ? <>Join {stationName}</> : 'Join a door'}
        </h1>
        <p className="mt-3 text-white/80">
          This phone, tablet or laptop will alert you when someone rings at the door. No account needed.
        </p>
      </div>

      {!joinToken && (
        <label className="block">
          <span className="block text-sm font-medium text-white/85 mb-1.5">8-character code from the staff card</span>
          <input
            value={code.length > 4 ? `${cleanCode.slice(0, 4)} ${cleanCode.slice(4)}` : cleanCode}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            data-autofocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'door-join-error' : undefined}
            className="w-full rounded-xl bg-white/10 border border-white/25 px-4 py-3 font-mono text-4xl tracking-[0.2em] uppercase text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            placeholder="K7MQ 4XRT"
          />
        </label>
      )}

      <label className="block">
        <span className="block text-sm font-medium text-white/85 mb-1.5">Name this device</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 40))}
          maxLength={40}
          autoComplete="off"
          enterKeyHint="go"
          className="w-full rounded-xl bg-white/10 border border-white/25 px-4 py-3 text-base text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          placeholder="e.g. Danny’s phone, Front desk iPad"
        />
      </label>

      {error && <p id="door-join-error" role="alert" className="rounded-xl bg-red-500/15 border border-red-400/40 px-4 py-3 text-red-100">{error}</p>}

      <button
        type="submit"
        disabled={!ready || busy}
        className={`press min-h-14 rounded-2xl px-6 text-2xl ${DISPLAY_TYPE} disabled:opacity-50`}
        style={{ backgroundColor: 'var(--door-primary)', color: 'var(--door-on-primary)' }}
      >
        {busy ? 'Joining…' : 'Join'}
      </button>
    </form>
  )
}
