import { computeTax, type OrgTaxRate } from '@/lib/tax'

/**
 * Money totals for the admin payments ledger (Admin → Payments): what has
 * been collected, and what's still owed.
 *
 * ── Collected ──
 * The revenue counting rule used everywhere money is summed (see
 * actions/finances.ts): payments with status paid / manual / refunded count
 * as GROSS minus refunded_cents, so a full refund nets to zero and a partial
 * refund keeps the retained portion. The tax shown with it is the tax on the
 * retained portion (pro-rated), so a fully refunded payment carries none.
 *
 * ── Owed ──
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
  payment: {
    amount_cents: number
    tax_cents?: number | null
    payment_method?: string | null
    status?: string
    refunded_cents?: number | null
  } | null
}

const COLLECTED_STATUSES = new Set(['paid', 'manual', 'refunded'])

/** Money kept from one payment, and the tax within it. */
export function collectedCents(r: LedgerRow): { totalCents: number; taxCents: number } {
  const p = r.payment
  if (!p || !COLLECTED_STATUSES.has(p.status ?? '')) return { totalCents: 0, taxCents: 0 }
  const gross = Math.max(0, p.amount_cents)
  const retained = gross - Math.min(gross, Math.max(0, p.refunded_cents ?? 0))
  const tax = p.tax_cents ?? 0
  return { totalCents: retained, taxCents: gross > 0 ? Math.round((tax * retained) / gross) : 0 }
}

/** Ledger-wide collected total (see the counting rule above). */
export function collectedTotals(rows: LedgerRow[]) {
  let totalCents = 0, taxCents = 0
  for (const r of rows) {
    const c = collectedCents(r)
    totalCents += c.totalCents
    taxCents += c.taxCents
  }
  return { totalCents, taxCents }
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

/**
 * Which of a registration's payment rows the ledger shows. A registration can
 * carry several — every Stripe checkout attempt inserts a new pending row, so
 * a player who abandoned a checkout and paid later has both — and reading an
 * arbitrary one mislabels them. Money received wins (paid/manual, then
 * refunded), then the newest attempt.
 */
export function pickLedgerPayment<P extends { status: string; created_at?: string | null }>(payments: P[] | P | null | undefined): P | null {
  const list = Array.isArray(payments) ? payments : payments ? [payments] : []
  const rank = (s: string) => (s === 'paid' || s === 'manual' ? 0 : s === 'refunded' ? 1 : 2)
  let best: P | null = null
  for (const p of list) {
    if (!best) { best = p; continue }
    const d = rank(p.status) - rank(best.status)
    if (d < 0 || (d === 0 && (p.created_at ?? '') > (best.created_at ?? ''))) best = p
  }
  return best
}

/** A payment row as the revenue reports read it. */
export interface RevenuePaymentRow {
  amount_cents: number | null
  refunded_cents?: number | null
  refunded_at?: string | null
  paid_at?: string | null
  created_at?: string | null
  payment_type?: string | null
  league_id?: string | null
  team_id?: string | null
  registration_id?: string | null
}

/**
 * Net registration revenue since `sinceIso`, by the same rules as the
 * financial report (actions/finances.ts#getFinancialReport): rows must already
 * be paid / manual / refunded; payments count by paid_at (else created_at),
 * refunds subtract on refunded_at; team fees count once per team; a
 * per-player payment counts only while its registration exists.
 */
export function netRevenueSince(rows: RevenuePaymentRow[], sinceIso: string): number {
  const since = new Date(sinceIso).getTime()
  const inWindow = (d: string | null | undefined) => !!d && new Date(d).getTime() >= since
  const seenTeams = new Set<string>()
  let cents = 0
  for (const p of rows) {
    const teamKey = p.payment_type === 'team' && p.team_id ? `${p.league_id}:${p.team_id}` : null
    if (teamKey) {
      if (seenTeams.has(teamKey)) continue
      seenTeams.add(teamKey)
    } else if (!p.registration_id) continue
    if ((p.refunded_cents ?? 0) > 0 && inWindow(p.refunded_at)) cents -= p.refunded_cents ?? 0
    if (inWindow(p.paid_at ?? p.created_at)) cents += p.amount_cents ?? 0
  }
  return cents
}
