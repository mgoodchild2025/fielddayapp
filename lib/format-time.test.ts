import { describe, it, expect } from 'vitest'
import { parseLocalToUtc, formatGameTime } from './format-time'

// America/Toronto: EDT (UTC-4) in summer, EST (UTC-5) in winter.
// DST 2026: begins Mar 8, ends Nov 1.

describe('parseLocalToUtc', () => {
  it('converts a summer (EDT, UTC-4) local time correctly', () => {
    expect(parseLocalToUtc('2026-07-15', '19:00', 'America/Toronto'))
      .toBe('2026-07-15T23:00:00.000Z')
  })

  it('converts a winter (EST, UTC-5) local time correctly', () => {
    expect(parseLocalToUtc('2026-01-15', '19:00', 'America/Toronto'))
      .toBe('2026-01-16T00:00:00.000Z')
  })

  it('uses the correct offset on the DST start day itself', () => {
    // Mar 8 2026, 10:00 — clocks already sprang forward at 2 a.m. → EDT (UTC-4)
    expect(parseLocalToUtc('2026-03-08', '10:00', 'America/Toronto'))
      .toBe('2026-03-08T14:00:00.000Z')
    // The evening before is still EST (UTC-5)
    expect(parseLocalToUtc('2026-03-07', '10:00', 'America/Toronto'))
      .toBe('2026-03-07T15:00:00.000Z')
  })

  it('handles 12-hour AM/PM input', () => {
    expect(parseLocalToUtc('2026-07-15', '7:00 PM', 'America/Toronto'))
      .toBe('2026-07-15T23:00:00.000Z')
    expect(parseLocalToUtc('2026-07-15', '7:00 AM', 'America/Toronto'))
      .toBe('2026-07-15T11:00:00.000Z')
  })

  it('handles the 12 AM / 12 PM edge cases', () => {
    // 12:00 AM = midnight local → 04:00 UTC in summer
    expect(parseLocalToUtc('2026-07-15', '12:00 AM', 'America/Toronto'))
      .toBe('2026-07-15T04:00:00.000Z')
    // 12:00 PM = noon local → 16:00 UTC in summer
    expect(parseLocalToUtc('2026-07-15', '12:00 PM', 'America/Toronto'))
      .toBe('2026-07-15T16:00:00.000Z')
  })

  it('respects other IANA timezones', () => {
    // Vancouver in summer is PDT (UTC-7)
    expect(parseLocalToUtc('2026-07-15', '19:00', 'America/Vancouver'))
      .toBe('2026-07-16T02:00:00.000Z')
  })

  it('round-trips with formatGameTime', () => {
    const utc = parseLocalToUtc('2026-07-15', '19:00', 'America/Toronto')
    const { time } = formatGameTime(utc, 'America/Toronto')
    expect(time.replace(/\s/g, ' ')).toMatch(/7:00/)
  })
})

describe('formatGameTime', () => {
  // Avoid asserting exact locale strings (ICU versions vary) — match key parts.
  it('renders the stored UTC moment in the venue timezone', () => {
    const { date, time, full } = formatGameTime('2026-07-15T23:00:00.000Z', 'America/Toronto')
    expect(time).toMatch(/7:00/)      // 23:00 UTC = 7 p.m. EDT
    expect(date).toMatch(/Jul/)
    expect(date).toMatch(/15/)
    expect(full).toMatch(/July/)
    expect(full).toMatch(/2026/)
  })

  it('shows a different wall-clock time in a different timezone', () => {
    const { time } = formatGameTime('2026-07-15T23:00:00.000Z', 'America/Vancouver')
    expect(time).toMatch(/4:00/)      // 23:00 UTC = 4 p.m. PDT
  })

  it('crosses the date line correctly for late-evening UTC times', () => {
    // 03:00 UTC on the 16th = 11 p.m. EDT on the 15th
    const { date, time } = formatGameTime('2026-07-16T03:00:00.000Z', 'America/Toronto')
    expect(time).toMatch(/11:00/)
    expect(date).toMatch(/15/)
  })
})
