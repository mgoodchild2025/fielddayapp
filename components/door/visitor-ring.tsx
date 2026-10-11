'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DISPLAY_TYPE } from './door-stripes'

/**
 * The visitor's side: one big RING button. No login, no cookies of its own;
 * the cooldown is remembered in sessionStorage but enforced by the server.
 */

type Phase = 'ready' | 'ringing' | 'sent' | 'acknowledged' | 'noanswer' | 'disarmed' | 'error'

type Saved = { ringId: string; visitorKey: string; at: number; cooldownUntil: number }

const POLL_MS = 3_000
const POLL_FOR_MS = 3 * 60_000

function load(key: string): Saved | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}
function save(key: string, value: Saved | null) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value))
    else sessionStorage.removeItem(key)
  } catch { /* private mode: the server still enforces the cooldown */ }
}

export function VisitorRing({
  publicToken,
  locationLabel,
  initiallyArmed,
  initialFallback,
}: {
  publicToken: string
  locationLabel: string | null
  initiallyArmed: boolean
  initialFallback: string | null
}) {
  const storageKey = `fieldday-door-ring:${publicToken}`
  const [phase, setPhase] = useState<Phase>(initiallyArmed ? 'ready' : 'disarmed')
  const [fallback, setFallback] = useState(initialFallback)
  const [name, setName] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const ringRef = useRef<Saved | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = null
  }, [])

  const startPolling = useCallback((ring: Saved) => {
    stopPolling()
    const tick = async () => {
      if (Date.now() - ring.at > POLL_FOR_MS) {
        stopPolling()
        setPhase((p) => (p === 'sent' ? 'noanswer' : p))
        return
      }
      try {
        const res = await fetch(`/api/door/${publicToken}/rings/${ring.ringId}?k=${encodeURIComponent(ring.visitorKey)}`, { cache: 'no-store' })
        if (!res.ok) return
        const body = await res.json()
        if (body.status === 'acknowledged') {
          stopPolling()
          setPhase('acknowledged')
          try { navigator.vibrate?.([60, 60, 60]) } catch { /* unsupported */ }
        }
      } catch { /* offline for a moment: keep polling */ }
    }
    void tick()
    pollTimer.current = setInterval(tick, POLL_MS)
  }, [publicToken, stopPolling])

  // Coming back to the page (refresh, back from another app) mid-ring.
  // (After hydration: the server render can't see sessionStorage.) Not when
  // the door loaded disarmed: the fallback message wins over an old ring.
  useEffect(() => {
    if (!initiallyArmed) return
    const restore = setTimeout(() => {
      const saved = load(storageKey)
      if (!saved) return
      ringRef.current = saved
      setCooldownUntil(saved.cooldownUntil)
      setNow(Date.now())
      if (Date.now() - saved.at < POLL_FOR_MS) {
        setPhase('sent')
        startPolling(saved)
      }
    }, 0)
    return () => { clearTimeout(restore); stopPolling() }
  }, [storageKey, startPolling, stopPolling, initiallyArmed])

  // One-second clock while a cooldown is counting down.
  useEffect(() => {
    if (cooldownUntil <= now) return
    const t = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [cooldownUntil, now])

  const waitSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
  const coolingDown = waitSeconds > 0

  async function ring() {
    if (phase === 'ringing' || coolingDown) return
    setPhase('ringing')
    try { navigator.vibrate?.(30) } catch { /* unsupported */ }
    try {
      const res = await fetch(`/api/door/${publicToken}/ring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 201) {
        const saved: Saved = {
          ringId: body.ringId,
          visitorKey: body.visitorKey,
          at: Date.now(),
          cooldownUntil: Date.now() + (body.cooldownSeconds ?? 45) * 1000,
        }
        ringRef.current = saved
        save(storageKey, saved)
        setCooldownUntil(saved.cooldownUntil)
        setNow(Date.now())
        setPhase('sent')
        startPolling(saved)
      } else if (res.status === 409) {
        setFallback(body.fallbackMessage ?? null)
        setPhase('disarmed')
      } else if (res.status === 429) {
        setCooldownUntil(Date.now() + (body.retryAfter ?? 30) * 1000)
        setNow(Date.now())
        setPhase(ringRef.current ? 'sent' : 'ready')
      } else {
        setPhase('error')
      }
    } catch {
      setPhase('error')
    }
  }

  if (phase === 'disarmed') {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-10" role="status">
        <p className={`${DISPLAY_TYPE} text-4xl`}>Door alert is off</p>
        <p className="text-lg text-white/85 max-w-xs">
          {fallback || 'Nobody is watching this door right now. Please knock loudly.'}
        </p>
      </div>
    )
  }

  const message =
    phase === 'ringing' ? 'Ringing inside…'
      : phase === 'sent' ? 'Done. Hang tight, someone’s coming.'
      : phase === 'acknowledged' ? 'Someone’s on the way to the door.'
      : phase === 'noanswer' ? 'No answer yet. Try ringing again, or knock loudly.'
      : phase === 'error' ? 'Check your signal and try again.'
      : ''

  const busy = phase === 'ringing'
  const disabled = busy || coolingDown

  return (
    <div className="flex flex-col items-center gap-7">
      <div className="text-center">
        <h1 className={`${DISPLAY_TYPE} text-6xl sm:text-7xl`}>At the door?</h1>
        <p className="mt-3 text-base text-white/80">
          Tap RING and someone inside will come to let you in.
        </p>
        {locationLabel && <p className="mt-1 text-sm text-white/65">{locationLabel}</p>}
      </div>

      {phase !== 'acknowledged' && (
        <label className="w-full max-w-xs">
          <span className="block text-sm font-medium text-white/80 mb-1.5">Your first name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 30))}
            maxLength={30}
            autoComplete="given-name"
            enterKeyHint="send"
            onKeyDown={(e) => { if (e.key === 'Enter') void ring() }}
            className="w-full rounded-xl bg-white/10 border border-white/25 px-4 py-3 text-base text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            placeholder="So they know who it is"
          />
        </label>
      )}

      {phase === 'acknowledged' ? (
        <div className="flex flex-col items-center gap-3 py-6 fd-result-in" role="status">
          <span aria-hidden="true" className="flex h-[200px] w-[200px] items-center justify-center rounded-full bg-emerald-500 text-[96px] text-white fd-check-pop">✓</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void ring()}
          disabled={disabled}
          aria-describedby="door-ring-status"
          className={`press relative flex h-[min(62vw,240px)] w-[min(62vw,240px)] min-h-[200px] min-w-[200px] items-center justify-center rounded-full shadow-2xl ring-8 ring-white/15 disabled:opacity-60 ${DISPLAY_TYPE} text-6xl`}
          style={{ backgroundColor: 'var(--door-primary)', color: 'var(--door-on-primary)' }}
        >
          {busy && <span aria-hidden="true" className="absolute inset-0 rounded-full motion-safe:animate-ping bg-white/25" />}
          <span className="relative">{coolingDown && phase !== 'ringing' ? `0:${String(waitSeconds).padStart(2, '0')}` : 'Ring'}</span>
        </button>
      )}

      <p id="door-ring-status" aria-live="polite" className="min-h-[3.5rem] max-w-xs text-center text-xl font-semibold">
        {message}
        {coolingDown && phase !== 'acknowledged' && phase !== 'ringing' && (
          <span className="block mt-1 text-sm font-normal text-white/70">You can ring again in {waitSeconds} s.</span>
        )}
      </p>
    </div>
  )
}
