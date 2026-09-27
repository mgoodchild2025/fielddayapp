import { describe, expect, it } from 'vitest'
import { isOwed, owedCents, outstandingTotals, type LedgerRow } from './payment-ledger'
import type { OrgTaxRate } from './tax'

const HST: OrgTaxRate = { id: 'r1', displayName: 'HST', percentage: 13, inclusive: false, appliesTo: 'all', stripeTaxRateId: null }
const HST_INCL: OrgTaxRate = { ...HST, inclusive: true }
const league = { price_cents: 10000, drop_in_price_cents: 1500 }

const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  paymentStatus: 'unpaid', isFree: false, registration_type: 'season', league, payment: null, ...over,
})

describe('isOwed', () => {
  it('counts unpaid, pending and failed', () => {
    for (const s of ['unpaid', 'pending', 'failed']) expect(isOwed(row({ paymentStatus: s }))).toBe(true)
  })
  it('ignores paid, refunded and free rows', () => {
    expect(isOwed(row({ paymentStatus: 'paid' }))).toBe(false)
    expect(isOwed(row({ paymentStatus: 'refunded' }))).toBe(false)
    expect(isOwed(row({ paymentStatus: 'free', isFree: true }))).toBe(false)
    expect(isOwed(row({ isFree: true }))).toBe(false)
  })
})

describe('owedCents', () => {
  it('prices a row with no payment at list + exclusive tax', () => {
    expect(owedCents(row(), [HST])).toEqual({ totalCents: 11300, taxCents: 1300 })
  })
  it('uses the drop-in price for drop-in registrations', () => {
    expect(owedCents(row({ registration_type: 'drop_in' }), [HST])).toEqual({ totalCents: 1695, taxCents: 195 })
  })
  it('falls back to the season price when a drop-in price is not set', () => {
    const r = row({ registration_type: 'drop_in', league: { price_cents: 2000, drop_in_price_cents: null } })
    expect(owedCents(r, []).totalCents).toBe(2000)
  })
  it('takes an offline pending row as recorded (already tax-inclusive)', () => {
    const r = row({ paymentStatus: 'pending', payment: { amount_cents: 11300, tax_cents: 1300, payment_method: 'etransfer' } })
    expect(owedCents(r, [HST])).toEqual({ totalCents: 11300, taxCents: 1300 })
  })
  it('does not add tax to an offline row recorded before the org charged tax', () => {
    const r = row({ paymentStatus: 'pending', payment: { amount_cents: 10000, tax_cents: 0, payment_method: 'cash' } })
    expect(owedCents(r, [HST])).toEqual({ totalCents: 10000, taxCents: 0 })
  })
  it('adds tax to a Stripe pending row (pre-tax, discount already applied)', () => {
    const r = row({ paymentStatus: 'pending', payment: { amount_cents: 9000, tax_cents: null, payment_method: null } })
    expect(owedCents(r, [HST])).toEqual({ totalCents: 10170, taxCents: 1170 })
  })
  it('never adds inclusive tax on top', () => {
    expect(owedCents(row(), [HST_INCL])).toEqual({ totalCents: 10000, taxCents: 1150 })
  })
  it('is zero for rows that are not owed', () => {
    expect(owedCents(row({ paymentStatus: 'paid' }), [HST])).toEqual({ totalCents: 0, taxCents: 0 })
  })
})

describe('outstandingTotals', () => {
  it('sums owed rows only', () => {
    const rows = [
      row(),                                                   // 113.00 incl 13.00
      row({ paymentStatus: 'failed', payment: { amount_cents: 5000, payment_method: 'stripe' } }), // 56.50 incl 6.50
      row({ paymentStatus: 'paid', payment: { amount_cents: 10000 } }),
      row({ isFree: true, paymentStatus: 'free' }),
    ]
    expect(outstandingTotals(rows, [HST])).toEqual({ totalCents: 16950, taxCents: 1950, count: 2 })
  })
  it('is empty for an empty ledger', () => {
    expect(outstandingTotals([], [HST])).toEqual({ totalCents: 0, taxCents: 0, count: 0 })
  })
})
