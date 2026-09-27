import { computeTax, type OrgTaxRate } from '@/lib/tax'

/**
 * What's still owed on the admin payments ledger (Admin → Payments).
 *
 * A row is owed while it's unpaid, pending, or failed (never when free). The
 * amount owed is what the player/team will actually pay, tax included:
 *  - an offline (e-transfer/cash/cheque) pending row already stores the
 *    tax-inclusive gross (+ tax_cents) — use it as recorded;
 *  - a Stripe pending/failed row stores the pre-tax price (Stripe adds the
 *    tax at checkout), and a row with no payment yet has only the list
 *    price — add the org's registration tax to either.
 * Discounts are only known once a payment row exists, so a no-payment row is
 * priced at list.
 */

export const OWED_STATUSES = ['unpaid', 'pending', 'failed'] as const

export interface LedgerRow {
  paymentStatus: string
  isFree: boolean
  registration_type?: string | null
  league: { price_cents: number; drop_in_price_cents?: number | null } | null
  payment: { amount_cents: number; tax_cents?: number | null; payment_method?: string | null } | null
}

const OFFLINE_METHODS = new Set(['etransfer', 'cash', 'cheque', 'other'])

export function isOwed(r: LedgerRow): boolean {
  return !r.isFree && (OWED_STATUSES as readonly string[]).includes(r.paymentStatus)
}

/** Amount still owed on one row, tax included, and the tax within it. */
export function owedCents(r: LedgerRow, rates: OrgTaxRate[]): { totalCents: number; taxCents: number } {
  if (!isOwed(r)) return { totalCents: 0, taxCents: 0 }
  const p = r.payment
  if (p && ((p.tax_cents ?? 0) > 0 || OFFLINE_METHODS.has(p.payment_method ?? ''))) {
    return { totalCents: p.amount_cents, taxCents: p.tax_cents ?? 0 }
  }
  const base = p
    ? p.amount_cents
    : r.registration_type === 'drop_in'
      ? (r.league?.drop_in_price_cents ?? r.league?.price_cents ?? 0)
      : (r.league?.price_cents ?? 0)
  const t = computeTax(base, rates)
  return { totalCents: t.totalCents, taxCents: t.taxCents }
}

/** Ledger-wide outstanding total. `rates` = the org's registration-scope rates. */
export function outstandingTotals(rows: LedgerRow[], rates: OrgTaxRate[]) {
  let totalCents = 0, taxCents = 0, count = 0
  for (const r of rows) {
    if (!isOwed(r)) continue
    const o = owedCents(r, rates)
    totalCents += o.totalCents
    taxCents += o.taxCents
    count++
  }
  return { totalCents, taxCents, count }
}
