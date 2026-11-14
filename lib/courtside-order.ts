/**
 * Court-first ordering for Courtside / Scorekeeping (pure; tested). On a busy
 * tournament day a volunteer stands at one court: they pick it once, and see
 * that court's game on now, the next one, and everything else folded away —
 * so the card they tap is the game in front of them.
 */

export type OrderItem = {
  id: string
  when: string // ISO start
  court: string | null
  teams: [string, string]
}

/** Compare courts as people mean them: "court 3 " and "Court 3" are one court. '' = no court set. */
export function courtKey(court: string | null | undefined): string {
  return (court ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Distinct courts of the day in natural order (Court 2 before Court 10), no-court last; label = first spelling seen. */
export function listCourts(items: { court: string | null }[]): { key: string; label: string }[] {
  const labels = new Map<string, string>()
  for (const i of items) {
    const key = courtKey(i.court)
    if (!labels.has(key)) labels.set(key, (i.court ?? '').trim().replace(/\s+/g, ' '))
  }
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
  return [...labels.entries()]
    .map(([key, label]) => ({ key, label: key === '' ? 'No court' : label }))
    .sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : collator.compare(a.key, b.key)))
}

export function onCourt<T extends { court: string | null }>(items: T[], key: string): T[] {
  return items.filter((i) => courtKey(i.court) === key)
}

/** Team names (or the court) contain every word typed, ignoring case. */
export function matchesSearch(item: OrderItem, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = `${item.teams[0]} ${item.teams[1]} ${item.court ?? ''}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** A game counts as "on now" from a few minutes before its start. */
export const NOW_LEAD_MS = 5 * 60 * 1000

/**
 * Split one court's UNSCORED games:
 * - `now`: the latest game that has started (the one being played, or just finished);
 * - `missed`: earlier games still without a score — shown apart, so a volunteer
 *   doesn't type tonight's result into the 9:00 game they forgot;
 * - `next`: the game after `now` (or the first one, before play starts);
 * - `later`: the rest.
 */
export function planCourt<T extends { when: string }>(unscored: T[], nowMs: number): {
  missed: T[]
  now: T | null
  next: T | null
  later: T[]
} {
  const sorted = [...unscored].sort((a, b) => a.when.localeCompare(b.when))
  let current = -1
  sorted.forEach((item, i) => {
    if (new Date(item.when).getTime() <= nowMs + NOW_LEAD_MS) current = i
  })
  if (current < 0) {
    return { missed: [], now: null, next: sorted[0] ?? null, later: sorted.slice(1) }
  }
  return {
    missed: sorted.slice(0, current),
    now: sorted[current],
    next: sorted[current + 1] ?? null,
    later: sorted.slice(current + 2),
  }
}

/** The device remembers its court for the day: `<YYYY-MM-DD>|<court>` in a cookie. */
export const COURT_COOKIE = 'fd_courtside_court'

export function readCourtCookie(value: string | undefined, date: string): string | null {
  if (!value) return null
  let decoded = value
  try { decoded = decodeURIComponent(value) } catch { /* keep raw */ }
  const sep = decoded.indexOf('|')
  if (sep < 0 || decoded.slice(0, sep) !== date) return null
  return courtKey(decoded.slice(sep + 1))
}
