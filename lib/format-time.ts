/**
 * Format a UTC timestamp for display in the org's local timezone.
 * Falls back to 'America/Toronto' if timezone is not set.
 */
export function formatGameTime(
  isoString: string,
  timezone: string = 'America/Toronto'
): { date: string; time: string; full: string } {
  const dt = new Date(isoString)
  const opts: Intl.DateTimeFormatOptions = { timeZone: timezone }

  const date = dt.toLocaleDateString('en-CA', {
    ...opts,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const time = dt.toLocaleTimeString('en-CA', {
    ...opts,
    hour: 'numeric',
    minute: '2-digit',
  })

  const full = dt.toLocaleDateString('en-CA', {
    ...opts,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return { date, time, full }
}
