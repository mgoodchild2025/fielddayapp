'use client'

import { useEffect, useRef } from 'react'

/**
 * Run `reset` when the page comes back from the back-forward cache — e.g. a
 * player taps Back (or swipes) on Stripe's checkout. The page is restored
 * exactly as it was left: buttons frozen on "Redirecting to checkout…".
 */
export function useBfcacheReset(reset: () => void) {
  const ref = useRef(reset)
  useEffect(() => { ref.current = reset })
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) ref.current() }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])
}
