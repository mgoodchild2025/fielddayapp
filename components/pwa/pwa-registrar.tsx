'use client'

import { useEffect } from 'react'
import { isIOS, isStandalone, registerServiceWorker, syncPushSubscription } from '@/lib/push-client'
import { logPwaLaunch, type PwaPlatform } from '@/actions/pwa'

const LAUNCH_FLAG = 'fieldday-launch-logged'

function platform(): PwaPlatform {
  if (isIOS()) return 'ios'
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop'
  return 'other'
}

/**
 * Mounted once in the org layout. Registers the root service worker (push +
 * badge — no caching) and, if this browser already receives alerts, re-syncs
 * the subscription so the server row stays fresh. Never asks for permission —
 * that only happens from a tap (AlertsNudge / PushSettingsCard). Also records
 * one launch per session (standalone vs tab, platform) for install metrics.
 */
export function PwaRegistrar() {
  useEffect(() => {
    let cancelled = false
    try {
      if (!sessionStorage.getItem(LAUNCH_FLAG)) {
        sessionStorage.setItem(LAUNCH_FLAG, '1')
        void logPwaLaunch({ standalone: isStandalone(), platform: platform() })
      }
    } catch { /* storage unavailable — skip metrics */ }
    ;(async () => {
      const reg = await registerServiceWorker()
      if (!reg || cancelled) return
      await syncPushSubscription()
    })().catch(() => {})
    return () => { cancelled = true }
  }, [])
  return null
}
