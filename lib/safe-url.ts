/**
 * A stored link is only ever rendered as a link if it is a web address.
 *
 * Tenants and players type these (social links, sponsor sites, live streams),
 * and `<a href>` will run `javascript:` or open `data:` if handed one. This
 * returns a normalised http(s) URL, or null. A value typed without a scheme
 * ("instagram.com/kaboom") gets https://.
 */
export function safeHttpUrl(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim()
  if (!raw || raw.length > 2000) return null
  // Control characters and whitespace have no place in a URL; browsers strip
  // some of them, which is how "java\tscript:" slips past naive checks.
  if (/[\u0000- \u007f]/.test(raw)) return null
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  // A real site has a dotted host (or is localhost in development).
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
  return url.toString()
}
