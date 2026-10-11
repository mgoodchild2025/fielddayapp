'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Keep the screen on while a display is armed. The browser drops the lock
 * whenever the page is hidden, so it is re-requested on every return.
 * `supported` false → the page shows the platform's screen-timeout steps.
 */
export function useWakeLock() {
  const [supported] = useState(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator)
  const [active, setActive] = useState(false)
  const wanted = useRef(false)
  const lock = useRef<WakeLockSentinel | null>(null)

  const acquire = useCallback(async () => {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    try {
      lock.current = await navigator.wakeLock.request('screen')
      setActive(true)
      lock.current.addEventListener('release', () => setActive(false))
    } catch {
      setActive(false) // low battery mode, or the browser said no
    }
  }, [])

  const request = useCallback(async () => {
    wanted.current = true
    await acquire()
  }, [acquire])

  const release = useCallback(() => {
    wanted.current = false
    void lock.current?.release()
    lock.current = null
  }, [])

  useEffect(() => {
    const onVisible = () => { if (wanted.current && document.visibilityState === 'visible') void acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock.current?.release()
    }
  }, [acquire])

  return { supported, active, request, release }
}
