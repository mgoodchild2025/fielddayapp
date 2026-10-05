/**
 * Convert a local date + time string to a UTC ISO string for a given timezone.
 * This correctly handles DST — e.g. "19:00" in "America/Toronto" on a summer
 * date becomes 23:00 UTC (EDT = UTC-4), not 00:00 UTC (EST = UTC-5).
 *
 * @param dateStr   "YYYY-MM-DD"
 * @param timeStr   "HH:MM" or "H:MM AM/PM"
 * @param timezone  IANA timezone name, e.g. "America/Toronto"
 */
export function parseLocalToUtc(dateStr: string, timeStr: string, timezone: string): string {
  // Normalize to "HH:MM" 24h format
  let normalizedTime = timeStr.trim()
  const ampm = normalizedTime.match(/\s*(AM|PM)$/i)
  if (ampm) {
    const isPm = ampm[1].toUpperCase() === 'PM'
    const base = normalizedTime.replace(/\s*(AM|PM)$/i, '').trim()
    const [hStr, mStr] = base.split(':')
    let h = parseInt(hStr, 10)
    if (isPm && h !== 12) h += 12
    if (!isPm && h === 12) h = 0
    normalizedTime = `${String(h).padStart(2, '0')}:${mStr ?? '00'}`
  }
  if (!normalizedTime.includes(':')) normalizedTime += ':00'

  // Step 1: treat input as UTC (a "reference" UTC moment)
  const refUtc = new Date(`${dateStr}T${normalizedTime}:00Z`)
  if (isNaN(refUtc.getTime())) {
    // Fallback — let the runtime guess
    return new Date(`${dateStr} ${timeStr}`).toISOString()
  }

  // Step 2: format refUtc in the target timezone to find what local time it maps to
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const offsetAt = (instant: Date) => {
    const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]))
    const hour = parts.hour === '24' ? '00' : parts.hour
    const tzLocal = new Date(`${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}Z`)
    return tzLocal.getTime() - instant.getTime()
  }

  // Step 3: compute offset and apply. Two passes: the offset is first measured
  // at the reference instant, which on a DST-change day can sit on the other
  // side of the switch from the real answer (3:30am on fall-back day came out
  // an hour early) — re-measure at the candidate and use that if it differs.
  const firstOffset = offsetAt(refUtc)
  const candidate = new Date(refUtc.getTime() - firstOffset)
  const secondOffset = offsetAt(candidate)
  return new Date(refUtc.getTime() - secondOffset).toISOString()
}

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

/**
 * Format a calendar date stored without a time ("YYYY-MM-DD", e.g.
 * leagues.season_start_date) as that same day, everywhere.
 *
 * `new Date('2026-11-21')` is midnight UTC, so formatting it in local time
 * shows Nov 20 to anyone west of Greenwich — and when a component renders on
 * both the server (UTC) and the browser, the two disagree (React #418) and
 * the browser's wrong day wins. Pinning the format to UTC keeps the stored
 * date. Accepts a full ISO timestamp too (only the date part is used).
 */
export function formatDateOnly(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
  locale = 'en-CA',
): string {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
}

/**
 * A UTC timestamp as the value of a `<input type="datetime-local">` showing
 * the ORG's wall-clock time ("2026-09-01T19:00"). The inverse of
 * `parseLocalToUtc` / the server's local→UTC conversion — a form must fill its
 * fields with this, never `iso.slice(0, 16)` (that's UTC wall-clock, which the
 * save then reads as org time and shifts by the UTC offset on every save).
 */
export function utcToLocalInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((p) => [p.type, p.value]),
  )
  const hour = parts.hour === '24' ? '00' : parts.hour
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`
}

/** The calendar year of `date` in `timezone` (the server's getFullYear() is UTC). */
export function yearInTimezone(date: Date | string, timezone: string): number {
  const d = typeof date === 'string' ? new Date(date) : date
  return Number(new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: timezone }).format(d))
}

/** ISO instant of Jan 1, 00:00 of the current year in `timezone`. */
export function startOfYearInTimezone(timezone: string, now: Date = new Date()): string {
  return parseLocalToUtc(`${yearInTimezone(now, timezone)}-01-01`, '00:00', timezone)
}
