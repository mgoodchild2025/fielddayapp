'use client'

import { pairMyDeviceForDoor } from '@/actions/door'
import { safeAction } from '@/lib/action-errors'
import { ensureCurrentKey, isIOS, isStandalone, pushSupported } from '@/lib/push-client'
import { removePushSubscription, savePushSubscription } from '@/actions/push'
import { base64UrlToBytes, idbPut, moveAppDoorAlerts, readMyDoors, writeMyDoor } from './door-push'

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
  if (sub) {
    // Still on a rotated-out key? Re-subscribe, and move the app's record
    // and any doors this device already alerts for to the new subscription.
    const rekeyed = await ensureCurrentKey(reg, sub, vapidKey)
    sub = rekeyed.sub
    if (rekeyed.replaced) {
      await safeAction(removePushSubscription(rekeyed.replaced))
      if (sub) {
        await safeAction(savePushSubscription(sub.toJSON(), navigator.userAgent))
        await moveAppDoorAlerts(rekeyed.replaced, sub)
      }
    }
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidKey) as BufferSource })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Couldn’t subscribe to notifications.' }
    }
  }

  // Reuse this device's pairing for the door (e.g. from Open door screen).
  const existing = readMyDoors()[stationId]
  const paired = existing
    ? { displayToken: existing.displayToken, displayId: existing.displayId, label: 'this device', error: undefined }
    : await safeAction(pairMyDeviceForDoor(stationId, deviceKind()))
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
    // Don't leave a fresh pairing that can never alert (an existing one stays).
    if (!existing) await fetch(`/api/door/display/${paired.displayToken}`, { method: 'DELETE' }).catch(() => {})
    return { ok: false, error: 'Couldn’t reach the server. Check your connection and try again.' }
  }

  await idbPut(`display:${stationId}`, paired.displayToken)
  writeMyDoor(stationId, { displayToken: paired.displayToken, displayId: paired.displayId, viaApp: true })
  return { ok: true, label: paired.label }
}

/**
 * Stop door notifications on this device. It stays paired, so Open door
 * screen still works; the app's own notifications are untouched.
 */
export async function turnOffAppAlerts(stationId: string): Promise<{ ok: boolean }> {
  const mine = readMyDoors()[stationId]
  if (!mine) return { ok: true }
  try {
    const sub = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription()
    if (sub) {
      const res = await fetch(`/api/door/display/${mine.displayToken}/push`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      })
      if (!res.ok && res.status !== 404 && res.status !== 410) return { ok: false }
    }
  } catch {
    return { ok: false }
  }
  writeMyDoor(stationId, { ...mine, viaApp: false })
  return { ok: true }
}

/**
 * Open the door screen on this device: its existing pairing for the door, or
 * a new one (signed-in admin, no code). `from` is where its back link returns.
 */
export async function openDoorScreen(stationId: string, from: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let mine = readMyDoors()[stationId]
  if (!mine) {
    const paired = await safeAction(pairMyDeviceForDoor(stationId, deviceKind()))
    if (paired.error !== undefined) return { ok: false, error: paired.error }
    mine = { displayToken: paired.displayToken, displayId: paired.displayId, viaApp: false }
    writeMyDoor(stationId, mine)
  }
  window.location.href = `/door/display/${mine.displayToken}?from=${encodeURIComponent(from)}`
  return { ok: true }
}

/** Forget pairings for this browser that the server no longer lists (disconnected, expired, deleted). */
export function forgetStaleDoors(activeDisplayIds: Record<string, string[]>) {
  for (const [stationId, d] of Object.entries(readMyDoors())) {
    if (stationId in activeDisplayIds && !activeDisplayIds[stationId].includes(d.displayId)) writeMyDoor(stationId, null)
  }
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
