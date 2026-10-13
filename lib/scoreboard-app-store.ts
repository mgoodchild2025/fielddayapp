/**
 * The native Fieldday Scoreboard (iPhone + Apple Watch) on the App Store.
 * No storefront in the path: Apple redirects to the visitor's own country.
 */
export const SCOREBOARD_APP_STORE_URL = 'https://apps.apple.com/app/fieldday-scoreboard/id6820769803'

/** iPhone (not iPad — the app is iPhone-only, with a Watch companion). */
export function isIphone(userAgent: string): boolean {
  return /iPhone|iPod/.test(userAgent)
}
