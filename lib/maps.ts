/**
 * "Open this address in maps" links that land in the device's own maps app.
 *
 * - iOS / iPadOS: maps.apple.com is a universal link — it opens Apple Maps
 *   directly (and still works in a browser if Maps was removed).
 * - Android: the geo: URI opens the default maps app, or the app chooser
 *   when none is set.
 * - Everything else (desktop): Google Maps on the web, in a new tab.
 *
 * The server can't know the device, so pages render the web link and the
 * client swaps in the native one after hydration (see MapLink).
 */

export type MapPlatform = 'ios' | 'android' | 'web'

/** iPadOS reports a Mac user agent; touch support tells the two apart. */
export function detectMapPlatform(userAgent: string, maxTouchPoints = 0): MapPlatform {
  if (/android/i.test(userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  return 'web'
}

export function mapsHref(address: string, platform: MapPlatform): string {
  const q = encodeURIComponent(address.trim())
  if (platform === 'ios') return `https://maps.apple.com/?q=${q}`
  if (platform === 'android') return `geo:0,0?q=${q}`
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

/** Native links hand off to an app, so they must not open an empty tab. */
export function opensInNewTab(platform: MapPlatform): boolean {
  return platform === 'web'
}
