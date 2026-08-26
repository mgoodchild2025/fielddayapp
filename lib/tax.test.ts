import { describe, it, expect } from 'vitest'
import { computeTax, ratesForScope, taxSuffix, type OrgTaxRate } from './tax'

const hst: OrgTaxRate = { id: '1', displayName: 'HST', percentage: 13, inclusive: false, appliesTo: 'all', stripeTaxRateId: null }
const gst: OrgTaxRate = { id: '2', displayName: 'GST', percentage: 5, inclusive: false, appliesTo: 'all', stripeTaxRateId: null }
const pst: OrgTaxRate = { id: '3', displayName: 'PST', percentage: 7, inclusive: false, appliesTo: 'registrations', stripeTaxRateId: null }

describe('computeTax — exclusive', () => {
  it('the receipt example: $100 + 13% HST = $113', () => {
    const t = computeTax(10000, [hst])
    expect(t).toEqual({
      subtotalCents: 10000,
      lines: [{ displayName: 'HST', percentage: 13, taxCents: 1300 }],
      taxCents: 1300,
      totalCents: 11300,
    })
  })

  it('two rates apply together (GST + PST provinces)', () => {
    const t = computeTax(10000, [gst, pst])
    expect(t.lines.map((l) => l.taxCents)).toEqual([500, 700])
    expect(t.totalCents).toBe(11200)
  })

  it('rounds half-up per rate in cents', () => {
    // $19.99 * 13% = 259.87 → 260
    expect(computeTax(1999, [hst]).taxCents).toBe(260)
  })

  it('no rates or zero amount → untouched', () => {
    expect(computeTax(10000, []).totalCents).toBe(10000)
    expect(computeTax(0, [hst]).totalCents).toBe(0)
  })
})

describe('computeTax — inclusive', () => {
  const inclHst: OrgTaxRate = { ...hst, inclusive: true }

  it('backs the tax out without changing what the payer pays', () => {
    const t = computeTax(11300, [inclHst])
    expect(t.totalCents).toBe(11300)
    expect(t.subtotalCents).toBe(10000)
    expect(t.taxCents).toBe(1300)
  })

  it('lines always sum exactly to the backed-out tax (rounding remainder on the last line)', () => {
    const inclGst = { ...gst, inclusive: true }
    const inclPst = { ...pst, inclusive: true }
    const t = computeTax(9999, [inclGst, inclPst])
    expect(t.lines.reduce((s, l) => s + l.taxCents, 0)).toBe(t.taxCents)
    expect(t.subtotalCents + t.taxCents).toBe(9999)
  })
})

describe('scoping + display', () => {
  it('merch purchases skip registration-only rates', () => {
    expect(ratesForScope([gst, pst], 'merch').map((r) => r.displayName)).toEqual(['GST'])
    expect(ratesForScope([gst, pst], 'registrations')).toHaveLength(2)
  })

  it('price suffix names every applicable rate', () => {
    expect(taxSuffix([hst], 'registrations')).toBe('+ HST 13%')
    expect(taxSuffix([gst, pst], 'registrations')).toBe('+ GST 5% + PST 7%')
    expect(taxSuffix([{ ...hst, inclusive: true }], 'merch')).toBe('incl. HST 13%')
    expect(taxSuffix([pst], 'merch')).toBe('')
  })
})
