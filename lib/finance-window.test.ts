import { describe, it, expect } from 'vitest'
import { rollingFinanceWindow, DEFAULT_WINDOW_MONTHS } from './finance-window'

const at = (iso: string) => new Date(iso)

describe('rollingFinanceWindow', () => {
  it('defaults to twelve months', () => {
    expect(DEFAULT_WINDOW_MONTHS).toBe(12)
    expect(rollingFinanceWindow(undefined, at('2026-09-20T12:00:00.000Z')).months).toBe(12)
  })

  it('goes back exactly one year for a 12-month window', () => {
    const w = rollingFinanceWindow(12, at('2026-09-20T12:00:00.000Z'))
    expect(w.sinceDate).toBe('2025-09-20')
  })

  it('crosses the year boundary correctly', () => {
    expect(rollingFinanceWindow(3, at('2026-02-10T00:00:00.000Z')).sinceDate).toBe('2025-11-10')
  })

  it('clamps rather than overflowing when the target month is shorter', () => {
    // Six months before 31 August is 28/29 February, never 2 or 3 March.
    const w = rollingFinanceWindow(6, at('2026-08-31T00:00:00.000Z'))
    expect(w.sinceDate).toBe('2026-02-28')
  })

  it('lands on 29 February in a leap year rather than skipping it', () => {
    const w = rollingFinanceWindow(12, at('2025-02-28T00:00:00.000Z'))
    expect(w.sinceDate).toBe('2024-02-28')
    const leap = rollingFinanceWindow(1, at('2024-03-31T00:00:00.000Z'))
    expect(leap.sinceDate).toBe('2024-02-29')
  })

  it('handles a window longer than a year', () => {
    expect(rollingFinanceWindow(24, at('2026-09-20T00:00:00.000Z')).sinceDate).toBe('2024-09-20')
    expect(rollingFinanceWindow(18, at('2026-09-20T00:00:00.000Z')).sinceDate).toBe('2025-03-20')
  })

  it('exposes both a timestamp and a date bound, agreeing on the day', () => {
    const w = rollingFinanceWindow(12, at('2026-09-20T15:30:00.000Z'))
    expect(w.sinceIso).toMatch(/^2025-09-20T/)
    expect(w.sinceDate).toBe('2025-09-20')
    expect(w.sinceIso.slice(0, 10)).toBe(w.sinceDate)
  })

  it('labels the period so a bounded figure is never read as a lifetime total', () => {
    expect(rollingFinanceWindow(12, at('2026-09-20T00:00:00.000Z')).label).toBe('Last 12 months')
    expect(rollingFinanceWindow(24, at('2026-09-20T00:00:00.000Z')).label).toBe('Last 24 months')
  })
})
