// Sitemap construction, kept pure so it can be tested without a database.
//
// Crawlers and agents use <lastmod> to decide what to re-fetch, so every entry
// carries one where a real modification date exists. Never invent a date: a
// page with no known change date is emitted with <loc> alone.

export interface SitemapEntry {
  loc: string
  /** ISO date (YYYY-MM-DD) or full timestamp; omitted when unknown. */
  lastmod?: string | null
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Normalise a timestamp to the W3C date form sitemaps expect (YYYY-MM-DD).
 * Returns null for missing or unparseable input so the caller can omit the tag.
 */
export function toLastmod(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** Build a urlset document. Entries with no valid lastmod emit <loc> only. */
export function buildSitemapXml(entries: SitemapEntry[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ]
  for (const entry of entries) {
    const lastmod = toLastmod(entry.lastmod)
    lines.push(
      lastmod
        ? `  <url><loc>${xmlEscape(entry.loc)}</loc><lastmod>${lastmod}</lastmod></url>`
        : `  <url><loc>${xmlEscape(entry.loc)}</loc></url>`,
    )
  }
  lines.push('</urlset>', '')
  return lines.join('\n')
}
