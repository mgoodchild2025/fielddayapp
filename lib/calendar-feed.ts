/**
 * Helpers for embedding "subscribe to calendar" links in transactional emails.
 * Feed routes:
 *   - Event:  /api/events/[slug]/calendar.ics?token=...
 *   - Team:   /api/teams/[teamId]/calendar.ics?token=...
 */

/**
 * Build calendar-subscribe URLs for use in EMAIL.
 *
 * The Apple link is an https://-> webcal:// handoff (see /api/calendar-handoff)
 * rather than a raw `webcal://` URL, because email clients (e.g. Gmail) strip
 * non-http(s) hrefs to "#". The handoff also rebuilds the webcal URL from the
 * real request host at click time, so a stale/empty build-time host can't break it.
 */
export function calendarSubscribeUrls(
  host: string,
  feedPath: string,
): { webcalUrl: string; googleUrl: string } {
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  const feedUrl = `${protocol}://${host}${feedPath}`
  return {
    // https handoff (not raw webcal://) so the link survives email-client sanitizers
    webcalUrl: `${protocol}://${host}/api/calendar-handoff?p=${encodeURIComponent(feedPath)}`,
    googleUrl: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`,
  }
}

/**
 * Return the calendar_token for a league or team, generating + persisting one
 * if it doesn't exist yet. Returns null on failure (caller should then skip the
 * calendar CTA rather than emit a broken link).
 */
export async function ensureCalendarToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  table: 'leagues' | 'teams',
  id: string,
  existing?: string | null,
): Promise<string | null> {
  if (existing) return existing
  const token = crypto.randomUUID()
  const { data, error } = await db
    .from(table)
    .update({ calendar_token: token })
    .eq('id', id)
    .select('calendar_token')
    .single()
  if (error) return null
  return (data?.calendar_token as string) ?? token
}
