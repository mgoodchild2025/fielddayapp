import { cached } from '@/lib/org-cache'

/**
 * Org brand fonts, without a render-blocking request to Google.
 *
 * A `<link rel="stylesheet" href="https://fonts.googleapis.com/…">` blocks the
 * first paint on a request to another origin (DNS + TLS + fetch — the slowest
 * thing on a phone's cold load). Admins can pick ANY Google font by name, so
 * build-time self-hosting (next/font) can't cover them. Instead the server
 * fetches the stylesheet once per font pair, keeps it in memory, and the page
 * inlines it: no extra request before paint. Font files still come from
 * fonts.gstatic.com (preconnected) with font-display: swap.
 *
 * If the fetch fails, callers fall back to the old <link>, so fonts never
 * silently disappear.
 */

export function googleFontsUrl(headingFont: string, bodyFont: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@400;600;700&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap`
}

// The stylesheet varies by user agent; a current Chrome UA gets woff2 with
// unicode-range subsets, which every browser the app supports understands.
const MODERN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const KEEP_SUBSETS = new Set(['latin', 'latin-ext'])

/**
 * Keep only the @font-face blocks for the given subsets (Google labels each
 * block with a comment like `/* latin *\/`). Unlabelled blocks are kept.
 * Also strips `<`, so the CSS can never close the <style> it's inlined in.
 */
export function keepSubsets(css: string, keep: Set<string> = KEEP_SUBSETS): string {
  const out: string[] = []
  const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?(@font-face\s*\{[^}]*\})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const subset = m[1]
    if (!subset || keep.has(subset)) out.push(m[2])
  }
  return out.join('\n').replace(/</g, '')
}

const DAY = 24 * 60 * 60 * 1000

// Resolved stylesheets, readable synchronously. The fetch never sits on a
// render: a pair that isn't ready yet renders the <link> fallback while the
// fetch warms in the background (one per pair, in-flight shared via cached()).
const ready = new Map<string, { css: string; at: number }>()

/** Inline-able @font-face CSS for the pair, or null (use the <link> instead). */
export function getInlineFontCss(headingFont: string, bodyFont: string): string | null {
  const key = `${headingFont}|${bodyFont}`
  const hit = ready.get(key)
  if (hit && Date.now() - hit.at < DAY) return hit.css
  cached(`global:fonts:${key}`, DAY, async () => {
    const res = await fetch(googleFontsUrl(headingFont, bodyFont), {
      headers: { 'User-Agent': MODERN_UA },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`fonts ${res.status}`)
    const css = keepSubsets(await res.text())
    if (!css.includes('@font-face')) throw new Error('fonts: no faces')
    return css
  }).then(
    (css) => { if (ready.size > 500) ready.clear(); ready.set(key, { css, at: Date.now() }) },
    () => {}, // not cached: a later request tries again
  )
  return hit?.css ?? null // a stale copy beats the blocking <link> while refreshing
}
