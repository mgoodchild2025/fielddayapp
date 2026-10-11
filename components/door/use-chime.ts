'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Two-tone ding-dong made with Web Audio — no audio files to fetch on venue
 * wifi. Browsers only allow sound after a tap, so `unlock()` must run inside
 * the ARM SCREEN tap; after that `play()` works from timers.
 */
export function useChime() {
  const ctxRef = useRef<AudioContext | null>(null)

  const unlock = useCallback(() => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return false
    if (!ctxRef.current) ctxRef.current = new AC()
    void ctxRef.current.resume()
    return true
  }, [])

  const play = useCallback(() => {
    const ctx = ctxRef.current
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
      if (document.visibilityState === 'visible' && ctxRef.current?.state !== 'running') void ctxRef.current?.resume()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return { unlock, play }
}
