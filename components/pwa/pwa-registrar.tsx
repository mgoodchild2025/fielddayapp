'use client'

import { useEffect } from 'react'
import { isIOS, isStandalone, registerServiceWorker, syncPushSubscription } from '@/lib/push-client'
import { logPwaLaunch, type PwaPlatform } from '@/actions/pwa'
import { moveAppDoorAlerts } from '@/components/door/door-push'
// Imported for its side effect: catches Android's one-shot install prompt
// app-wide, so the dashboard nudge can still use it after a navigation.
import '@/lib/install-prompt'

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
      // After a VAPID key rotation this re-subscribes; door alerts that ride
      // on the app's subscription move over with it.
      const rekeyed = await syncPushSubscription()
      if (rekeyed && !cancelled) await moveAppDoorAlerts(rekeyed.replaced, rekeyed.sub)
    })().catch(() => {})
    return () => { cancelled = true }
  }, [])
  return null
}
