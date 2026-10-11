'use client'

import { alertMeOnThisDevice } from '@/actions/door'
import { safeAction } from '@/lib/action-errors'
import { isIOS, isStandalone, pushSupported } from '@/lib/push-client'
import { base64UrlToBytes, idbPut, readMyDoors, writeMyDoor } from './door-push'

/**
 * "Alert me on this phone" for signed-in admins: pair this device as a
 * display for a door, then receive its alerts through the Fieldday app's own
 * push subscription (the root worker, /sw.js) — no staff QR or code, and on
 * an iPhone no second home-screen icon. Never unsubscribes the root
 * subscription: it also carries the player's normal notifications.
 */

export type AppAlertEligibility = 'ok' | 'ios-browser' | 'unsupported' | 'denied'

export function appAlertEligibility(): AppAlertEligibility {
  if (isIOS() && !isStandalone()) return 'ios-browser'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ok'
}

export function deviceKind(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPod/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet'
  return 'computer'
}

async function rootRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
  } catch {
    return null
  }
}

/** Call straight from the tap: the permission prompt comes before any network wait. */
export async function turnOnAppAlerts(stationId: string, vapidKey: string | null): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  if (!vapidKey) return { ok: false, error: 'Notifications aren’t set up on this site yet.' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, error: permission === 'denied' ? 'Notifications are blocked for Fieldday on this device.' : 'Notifications weren’t allowed.' }
  }

  const reg = await rootRegistration()
  if (!reg) return { ok: false, error: 'Couldn’t start notifications on this device.' }
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidKey) as BufferSource })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Couldn’t subscribe to notifications.' }
    }
  }

  const paired = await safeAction(alertMeOnThisDevice(stationId, deviceKind()))
  if (paired.error !== undefined) return { ok: false, error: paired.error }

  let saved = false
  try {
    const res = await fetch(`/api/door/display/${paired.displayToken}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    })
    saved = res.ok
  } catch { /* handled below */ }
  if (!saved) {
    // Don't leave a paired device that can never alert.
    await fetch(`/api/door/display/${paired.displayToken}`, { method: 'DELETE' }).catch(() => {})
    return { ok: false, error: 'Couldn’t reach the server. Check your connection and try again.' }
  }

  await idbPut(`display:${stationId}`, paired.displayToken)
  writeMyDoor(stationId, { displayToken: paired.displayToken, displayId: paired.displayId })
  return { ok: true, label: paired.label }
}

/** Unpairs this device from the door; the app's own notifications are untouched. */
export async function turnOffAppAlerts(stationId: string): Promise<{ ok: boolean }> {
  const mine = readMyDoors()[stationId]
  if (!mine) return { ok: true }
  try {
    await fetch(`/api/door/display/${mine.displayToken}`, { method: 'DELETE' })
  } catch {
    return { ok: false }
  }
  writeMyDoor(stationId, null)
  await idbPut(`display:${stationId}`, null)
  return { ok: true }
}

export async function sendAppAlertTest(stationId: string): Promise<boolean> {
  const mine = readMyDoors()[stationId]
  if (!mine) return false
  try {
    return (await fetch(`/api/door/display/${mine.displayToken}/test`, { method: 'POST' })).ok
  } catch {
    return false
  }
}
