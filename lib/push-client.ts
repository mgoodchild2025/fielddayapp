'use client'

import { getVapidPublicKey, removePushSubscription, savePushSubscription } from '@/actions/push'

/**
 * Browser side of Web Push. Everything here is safe to call on any device:
 * unsupported browsers (and iOS Safari outside an installed app) report
 * `unsupported` and the UI adapts.
 */

export type PushState = 'unsupported' | 'default' | 'denied' | 'granted'

const SW_URL = '/sw.js'
const SYNC_FLAG = 'fieldday-push-synced'

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // display-mode also reports 'fullscreen' during in-page fullscreen — exclude it
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    (window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches && !document.fullscreenElement) ||
    nav.standalone === true
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1024
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushState(): PushState {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  } catch (err) {
    console.warn('[push] service worker registration failed:', err)
    return null
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Is this browser currently subscribed (regardless of what the server knows)? */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

/**
 * Ask for permission (MUST be called from a user gesture — iOS denies
 * permanently otherwise), subscribe, and record the subscription.
 */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'This browser can\'t receive alerts.' }
  const key = await getVapidPublicKey()
  if (!key) return { ok: false, error: 'Alerts aren\'t enabled on this site yet.' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, error: permission === 'denied' ? 'Notifications are blocked for this site.' : 'Permission not granted.' }

  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker())
  if (!reg) return { ok: false, error: 'Couldn\'t start the notification service.' }
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Subscription failed.' }
    }
  }

  const { error } = await savePushSubscription(sub.toJSON(), navigator.userAgent)
  if (error) return { ok: false, error }
  try { sessionStorage.setItem(SYNC_FLAG, '1') } catch { /* private mode */ }
  return { ok: true }
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  try { await sub.unsubscribe() } catch { /* already gone */ }
  await removePushSubscription(endpoint)
  try { sessionStorage.removeItem(SYNC_FLAG) } catch { /* ignore */ }
}

/**
 * On launch: if this browser already holds a subscription, refresh the server
 * row (last_seen_at, and re-attach it after a data wipe). Once per session.
 */
export async function syncPushSubscription(): Promise<void> {
  if (pushState() !== 'granted') return
  try { if (sessionStorage.getItem(SYNC_FLAG)) return } catch { /* ignore */ }
  const sub = await currentSubscription()
  if (!sub) return
  const { error } = await savePushSubscription(sub.toJSON(), navigator.userAgent)
  if (!error) { try { sessionStorage.setItem(SYNC_FLAG, '1') } catch { /* ignore */ } }
}

/** Sign-out: tell the worker to drop every cached page (offline copies are per session). */
export function clearOfflineCache(): void {
  try { navigator.serviceWorker?.controller?.postMessage({ type: 'clear-cache' }) } catch { /* no worker */ }
}

/** Home-screen badge = unread count. No-op where the Badging API is missing. */
export function setAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (count > 0) nav.setAppBadge?.(count).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  } catch { /* unsupported */ }
}
