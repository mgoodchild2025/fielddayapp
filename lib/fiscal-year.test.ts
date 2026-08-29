import { describe, it, expect } from 'vitest'
import { fiscalYearStart, currentFiscalYear, lastFiscalYear, sameRangeLastYear } from './fiscal-year'

describe('fiscal year ranges', () => {
  it('calendar-year orgs (start month 1) behave like plain years', () => {
    expect(currentFiscalYear(1, '2026-08-29')).toEqual({ from: '2026-01-01', to: '2026-08-29' })
    expect(lastFiscalYear(1, '2026-08-29')).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })

  it('an April fiscal year spans the calendar boundary', () => {
    // Before April: still in the FY that started last April.
    expect(fiscalYearStart(4, '2026-02-10')).toBe('2025-04-01')
    // From April on: the new FY.
    expect(fiscalYearStart(4, '2026-08-29')).toBe('2026-04-01')
    expect(lastFiscalYear(4, '2026-08-29')).toEqual({ from: '2025-04-01', to: '2026-03-31' })
  })

  it('shifts a range back one year, clamping Feb 29', () => {
    expect(sameRangeLastYear({ from: '2026-01-01', to: '2026-08-29' })).toEqual({ from: '2025-01-01', to: '2025-08-29' })
    expect(sameRangeLastYear({ from: '2024-02-29', to: '2024-06-30' })).toEqual({ from: '2023-02-28', to: '2023-06-30' })
  })

  it('last fiscal year ends on the correct month-end day', () => {
    // FY starting March → previous FY ends Feb 28/29.
    expect(lastFiscalYear(3, '2026-08-29').to).toBe('2026-02-28')
    expect(lastFiscalYear(3, '2025-08-29').to).toBe('2025-02-28')
    expect(lastFiscalYear(3, '2024-08-29').to).toBe('2024-02-29')
  })
})
