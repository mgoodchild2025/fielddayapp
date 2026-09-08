'use client'

import { useEffect } from 'react'
import { registerServiceWorker, syncPushSubscription } from '@/lib/push-client'

/**
 * Mounted once in the org layout. Registers the root service worker (push +
 * badge — no caching) and, if this browser already receives alerts, re-syncs
 * the subscription so the server row stays fresh. Never asks for permission —
 * that only happens from a tap (AlertsNudge / PushSettingsCard).
 */
export function PwaRegistrar() {
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const reg = await registerServiceWorker()
      if (!reg || cancelled) return
      await syncPushSubscription()
    })().catch(() => {})
    return () => { cancelled = true }
  }, [])
  return null
}
