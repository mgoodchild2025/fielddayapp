/**
 * Anonymous device identity for scoreboard adoption metrics.
 *
 * A random value kept in the browser's own localStorage. It identifies a
 * BROWSER, not a person: there is no account behind it, it never leaves the
 * device except as an opaque string, and clearing site data resets it. That is
 * the whole point — the scoreboard is login-optional, so there is no user to
 * attribute a launch to and we deliberately don't try to derive one.
 */

export const SCOREBOARD_DEVICE_KEY = 'fieldday-scoreboard-device'

/** 24 lowercase hex chars — enough to avoid collisions, too little to mean anything. */
const DEVICE_ID_RE = /^[0-9a-f]{24}$/

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_ID_RE.test(value)
}

export function generateDeviceId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The device's id, creating one on first use. Returns null when storage is
 * unavailable (private mode, blocked cookies) — metrics are never worth
 * breaking the scoreboard for, so callers simply skip logging.
 */
export function getDeviceId(): string | null {
  try {
    const existing = localStorage.getItem(SCOREBOARD_DEVICE_KEY)
    if (isValidDeviceId(existing)) return existing
    const fresh = generateDeviceId()
    localStorage.setItem(SCOREBOARD_DEVICE_KEY, fresh)
    return fresh
  } catch {
    return null
  }
}

export type ScoreboardPlatform = 'ios' | 'android' | 'desktop' | 'other'

/** Coarse bucket only — the full user-agent string is never recorded. */
export function detectPlatform(): ScoreboardPlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  const iOSLike = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (iOSLike) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop'
  return 'other'
}

/** Opened from the home screen. Excludes in-page fullscreen, which also matches. */
export function isStandaloneLaunch(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    (window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches && !document.fullscreenElement) ||
    nav.standalone === true
  )
}
