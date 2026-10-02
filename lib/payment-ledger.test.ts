import { describe, expect, it } from 'vitest'
import { collectedCents, collectedTotals, isOwed, owedCents, outstandingTotals, pickLedgerPayment, netRevenueSince, type LedgerRow } from './payment-ledger'
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

describe('collectedCents', () => {
  const paidRow = (payment: LedgerRow['payment']) => row({ paymentStatus: 'paid', payment })
  it('counts a paid payment in full, with its tax', () => {
    expect(collectedCents(paidRow({ amount_cents: 11300, tax_cents: 1300, status: 'paid' }))).toEqual({ totalCents: 11300, taxCents: 1300 })
  })
  it('counts manual payments', () => {
    expect(collectedCents(paidRow({ amount_cents: 5000, status: 'manual' })).totalCents).toBe(5000)
  })
  it('keeps the retained part of a partial refund, with pro-rated tax', () => {
    const r = paidRow({ amount_cents: 11300, tax_cents: 1300, status: 'refunded', refunded_cents: 5650 })
    expect(collectedCents(r)).toEqual({ totalCents: 5650, taxCents: 650 })
  })
  it('nets a full refund to zero', () => {
    const r = paidRow({ amount_cents: 11300, tax_cents: 1300, status: 'refunded', refunded_cents: 11300 })
    expect(collectedCents(r)).toEqual({ totalCents: 0, taxCents: 0 })
  })
  it('never goes negative when refunded_cents exceeds the amount', () => {
    expect(collectedCents(paidRow({ amount_cents: 1000, status: 'refunded', refunded_cents: 5000 })).totalCents).toBe(0)
  })
  it('follows the finance reports on a refund with no refunded amount recorded (counts it)', () => {
    expect(collectedCents(paidRow({ amount_cents: 1000, status: 'refunded', refunded_cents: null })).totalCents).toBe(1000)
  })
  it('ignores pending, failed, and missing payments', () => {
    expect(collectedCents(paidRow({ amount_cents: 1000, status: 'pending' })).totalCents).toBe(0)
    expect(collectedCents(paidRow({ amount_cents: 1000, status: 'failed' })).totalCents).toBe(0)
    expect(collectedCents(row()).totalCents).toBe(0)
  })
})

describe('collectedTotals', () => {
  it('sums every counted payment', () => {
    const rows = [
      row({ payment: { amount_cents: 11300, tax_cents: 1300, status: 'paid' } }),
      row({ payment: { amount_cents: 5000, status: 'manual' } }),
      row({ payment: { amount_cents: 11300, tax_cents: 1300, status: 'refunded', refunded_cents: 11300 } }),
      row({ payment: { amount_cents: 2000, status: 'pending' } }),
    ]
    expect(collectedTotals(rows)).toEqual({ totalCents: 16300, taxCents: 1300 })
  })
})

describe('pickLedgerPayment', () => {
  const pmt = (status: string, created_at: string) => ({ status, created_at })
  it('prefers the paid row over an abandoned checkout, whatever the order', () => {
    const abandoned = pmt('pending', '2026-09-01'), paid = pmt('paid', '2026-09-02')
    expect(pickLedgerPayment([abandoned, paid])).toBe(paid)
    expect(pickLedgerPayment([paid, abandoned])).toBe(paid)
  })
  it('treats manual as paid, and a refund above an open attempt', () => {
    const manual = pmt('manual', '2026-09-01'), refunded = pmt('refunded', '2026-09-03'), pending = pmt('pending', '2026-09-05')
    expect(pickLedgerPayment([pending, refunded, manual])).toBe(manual)
    expect(pickLedgerPayment([pending, refunded])).toBe(refunded)
  })
  it('takes the newest attempt among equals', () => {
    const older = pmt('pending', '2026-09-01'), newer = pmt('failed', '2026-09-04')
    expect(pickLedgerPayment([older, newer])).toBe(newer)
  })
  it('accepts a single object or nothing', () => {
    const one = pmt('paid', '2026-09-01')
    expect(pickLedgerPayment(one)).toBe(one)
    expect(pickLedgerPayment(null)).toBeNull()
    expect(pickLedgerPayment([])).toBeNull()
  })
})

describe('netRevenueSince', () => {
  const since = '2026-09-01T00:00:00.000Z'
  it('counts payments in the window by paid_at, falling back to created_at', () => {
    expect(netRevenueSince([
      { amount_cents: 5000, paid_at: '2026-09-10T00:00:00Z', registration_id: 'r1' },
      { amount_cents: 3000, paid_at: null, created_at: '2026-09-11T00:00:00Z', registration_id: 'r2' },
      { amount_cents: 9999, paid_at: '2026-08-31T23:59:59Z', registration_id: 'r3' },
    ], since)).toBe(8000)
  })
  it('subtracts refunds dated in the window, even for older payments', () => {
    expect(netRevenueSince([
      { amount_cents: 5000, paid_at: '2026-08-10T00:00:00Z', refunded_cents: 5000, refunded_at: '2026-09-05T00:00:00Z', registration_id: 'r1' },
      { amount_cents: 4000, paid_at: '2026-09-02T00:00:00Z', refunded_cents: 1000, refunded_at: '2026-09-03T00:00:00Z', registration_id: 'r2' },
    ], since)).toBe(-5000 + 4000 - 1000)
  })
  it('counts a team fee once and skips deleted-registration orphans', () => {
    const team = { amount_cents: 20000, paid_at: '2026-09-02T00:00:00Z', payment_type: 'team', league_id: 'l1', team_id: 't1' }
    expect(netRevenueSince([
      team, { ...team },
      { amount_cents: 7000, paid_at: '2026-09-02T00:00:00Z', registration_id: null },
    ], since)).toBe(20000)
  })
})
