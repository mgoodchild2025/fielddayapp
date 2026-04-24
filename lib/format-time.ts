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
  const parts = Object.fromEntries(fmt.formatToParts(refUtc).map((p) => [p.type, p.value]))
  const tzLocal = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)

  // Step 3: compute offset and apply
  const offsetMs = tzLocal.getTime() - refUtc.getTime()
  return new Date(refUtc.getTime() - offsetMs).toISOString()
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
