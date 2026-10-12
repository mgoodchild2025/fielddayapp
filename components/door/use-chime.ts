'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Two-tone ding-dong made with Web Audio — no audio files to fetch on venue
 * wifi. Browsers only allow sound after a tap, so `unlock()` must run inside
 * the ARM SCREEN tap; after that `play()` works from timers.
 *
 * The AudioContext is module-level, not per component: once the door screen
 * is armed, the in-app door alert (DoorWatcher) can chime on any Fieldday
 * page the user navigates to — until a full page reload.
 */
let sharedCtx: AudioContext | null = null

export function unlockDoorAudio(): boolean {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return false
  if (!sharedCtx) sharedCtx = new AC()
  void sharedCtx.resume()
  return true
}

/** True once sound was unlocked by a tap in this page session. */
export function doorAudioReady(): boolean {
  return sharedCtx !== null
}

export function useChime() {
  const ctxRef = useRef<AudioContext | null>(null)

  const unlock = useCallback(() => {
    const ok = unlockDoorAudio()
    ctxRef.current = sharedCtx
    return ok
  }, [])

  const play = useCallback(() => {
    const ctx = ctxRef.current ?? sharedCtx
    if (!ctx) return
    if (ctx.state !== 'running') void ctx.resume()
    const out = ctx.createDynamicsCompressor()
    out.connect(ctx.destination)
    const t = ctx.currentTime + 0.02
    const note = (freq: number, at: number, dur: number) => {
      for (const [mult, level] of [[1, 0.9], [2, 0.25], [3, 0.08]] as const) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq * mult
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(level, at + 0.015)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        osc.connect(gain).connect(out)
        osc.start(at)
        osc.stop(at + dur + 0.05)
      }
    }
    note(784, t, 1.1)        // G5 — ding
    note(622.25, t + 0.5, 1.6) // E♭5 — dong
  }, [])

  // iOS suspends the context when the page is hidden; wake it on return.
  useEffect(() => {
    const onVisible = () => {
      const ctx = ctxRef.current ?? sharedCtx
      if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') void ctx.resume()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return { unlock, play }
}
