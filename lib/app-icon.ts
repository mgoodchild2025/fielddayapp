/**
 * Home-screen identity for an org site: the short name under the icon and
 * the icon URLs. One place, used by the org layout (iOS: apple-touch-icon +
 * apple-mobile-web-app-title) and the manifest (Android / desktop installs).
 */

/** Name under the home-screen icon — long names keep their first word. */
export function shortAppName(name: string): string {
  return name.length > 12 ? name.split(' ')[0] : name
}

export const ICON_SIZES = [180, 192, 512] as const
export type IconSize = (typeof ICON_SIZES)[number]

/**
 * PNG app icon rendered from the org's logo (`app/api/org-icon/route.ts`).
 * The logo's own `?t=` version rides along so a new logo gets a new URL —
 * home screens cache icons hard.
 */
export function orgIconUrl(logoUrl: string, size: IconSize, maskable = false): string {
  let v = ''
  try { v = new URL(logoUrl).searchParams.get('t') ?? '' } catch { /* relative / odd URL */ }
  return `/api/org-icon?size=${size}${maskable ? '&maskable=1' : ''}${v ? `&v=${encodeURIComponent(v)}` : ''}`
}

/** Fraction of the canvas the logo may fill. Maskable icons get cropped to a
 *  circle/squircle by Android (safe zone = central 80%); iOS rounds corners. */
export function logoFill(maskable: boolean): number {
  return maskable ? 0.7 : 0.84
}
