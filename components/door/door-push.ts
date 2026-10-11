'use client'

import { isIOS, isStandalone, pushSupported } from '@/lib/push-client'

/**
 * Notify mode: Web Push through the door's own service worker (/door/sw.js,
 * scope /door/ — separate from the app's root /sw.js). The worker needs the
 * display token to acknowledge from a notification button, so it is kept in
 * IndexedDB, which workers can read.
 */

export type DoorPushState =
  | 'on-app'           // alerts come through the Fieldday app (an admin's "Alert me on this phone")
  | 'unsupported'      // no Push API at all
  | 'ios-install'      // iPhone/iPad outside a home-screen web app
  | 'default'          // never asked
  | 'denied'           // blocked in browser settings
  | 'off'              // allowed, but this browser isn't subscribed for this display
  | 'on'

const SW_URL = '/door/sw.js'
const SCOPE = '/door/'

export async function doorPushState(displayToken?: string): Promise<DoorPushState> {
  if (displayToken && Object.values(readMyDoors()).some((d) => d.displayToken === displayToken)) return 'on-app'
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'default'
  const reg = await navigator.serviceWorker.getRegistration(SCOPE)
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

export function base64UrlToBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function idbPut(key: string, value: string | null): Promise<void> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('fieldday-door', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('kv')
      open.onsuccess = () => {
        const tx = open.result.transaction('kv', 'readwrite')
        if (value === null) tx.objectStore('kv').delete(key)
        else tx.objectStore('kv').put(value, key)
        tx.oncomplete = () => { open.result.close(); resolve() }
        tx.onerror = () => resolve()
      }
      open.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function registerDoorWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: SCOPE })
  } catch {
    return null
  }
}

/** Must be called straight from a tap: permission is asked before any network wait. */
export async function enableDoorPush(displayToken: string, vapidKey: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'This browser can’t receive notifications.' }
  if (!vapidKey) return { ok: false, error: 'Notifications aren’t set up on this site yet.' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, error: permission === 'denied' ? 'Notifications are blocked for this site.' : 'Notifications weren’t allowed.' }
  }
  const reg = await registerDoorWorker()
  if (!reg) return { ok: false, error: 'Couldn’t start the notification service.' }
  await navigator.serviceWorker.ready
  await idbPut('displayToken', displayToken)

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidKey) as BufferSource })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Subscription failed.' }
    }
  }
  try {
    const res = await fetch(`/api/door/display/${displayToken}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    })
    if (!res.ok) return { ok: false, error: 'Couldn’t save this device for notifications.' }
  } catch {
    return { ok: false, error: 'Couldn’t reach the server. Check your connection.' }
  }
  return { ok: true }
}

export async function disableDoorPush(displayToken: string): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration(SCOPE)
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  try {
    await fetch(`/api/door/display/${displayToken}/push`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
  } catch { /* the server prunes dead subscriptions anyway */ }
  await sub.unsubscribe().catch(() => {})
}

/** Keeps the worker's copy of the token current when a paired page opens. */
export async function rememberDisplayForWorker(displayToken: string) {
  if (typeof indexedDB !== 'undefined') await idbPut('displayToken', displayToken)
}

// ── Doors this browser gets alerts for through the Fieldday app ──────────────
// (Admin → Settings → Door Alert → "Alert me on this phone".) One display per
// station; the root worker looks tokens up as IndexedDB 'display:<stationId>'.

const MY_DOORS_KEY = 'fieldday-door-mine'
export type MyDoors = Record<string, { displayToken: string; displayId: string }>

export function readMyDoors(): MyDoors {
  try {
    const parsed = JSON.parse(localStorage.getItem(MY_DOORS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed as MyDoors : {}
  } catch {
    return {}
  }
}

export function writeMyDoor(stationId: string, value: MyDoors[string] | null) {
  try {
    const all = readMyDoors()
    if (value) all[stationId] = value
    else delete all[stationId]
    localStorage.setItem(MY_DOORS_KEY, JSON.stringify(all))
  } catch { /* storage blocked: the server-side pairing still works */ }
}
