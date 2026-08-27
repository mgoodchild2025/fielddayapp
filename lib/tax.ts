import type { createServiceRoleClient } from '@/lib/supabase/service'

/**
 * Tax on purchases (X1). One helper for every money path.
 *
 * Stripe checkouts attach the org's Stripe Tax Rate objects to line items and
 * let Stripe do the math; this module's arithmetic exists for everything that
 * ISN'T a Stripe session — offline (cash/e-transfer) payment rows and price
 * displays — and is tested so both worlds agree.
 *
 * Rule of application, everywhere: subtotal → discounts → tax.
 */

export interface OrgTaxRate {
  id: string
  displayName: string
  percentage: number
  inclusive: boolean
  appliesTo: 'all' | 'registrations' | 'merch'
  stripeTaxRateId: string | null
  /** When the rate was added — enrolments signed before this stay untaxed. */
  createdAt?: string | null
}

export type TaxScope = 'registrations' | 'merch'

export interface TaxBreakdown {
  /** The pre-tax amount (= input when exclusive; backed out when inclusive). */
  subtotalCents: number
  /** Per-rate amounts, in rate order. */
  lines: { displayName: string; percentage: number; taxCents: number }[]
  taxCents: number
  /** What the payer actually pays. */
  totalCents: number
}

/** Rates applicable to a purchase kind. */
export function ratesForScope(rates: OrgTaxRate[], scope: TaxScope): OrgTaxRate[] {
  return rates.filter((r) => r.appliesTo === 'all' || r.appliesTo === scope)
}

/**
 * Computes the tax breakdown for a post-discount subtotal.
 *
 * Exclusive rates add on top; inclusive rates are backed out of the given
 * amount (the payer's total stays what was displayed). Mixing inclusive and
 * exclusive rates is rejected upstream (the admin UI enforces one mode), but
 * if both arrive, inclusive wins for safety: never charge above the shown
 * price. Rounding: half-up per rate, in cents.
 */
export function computeTax(amountCents: number, rates: OrgTaxRate[]): TaxBreakdown {
  const active = rates.filter((r) => r.percentage > 0)
  if (amountCents <= 0 || active.length === 0) {
    return { subtotalCents: Math.max(0, amountCents), lines: [], taxCents: 0, totalCents: Math.max(0, amountCents) }
  }

  const inclusive = active.some((r) => r.inclusive)
  const totalPct = active.reduce((sum, r) => sum + r.percentage, 0)

  if (inclusive) {
    // amount = subtotal * (1 + totalPct/100)  →  back the subtotal out
    const subtotal = Math.round((amountCents * 100) / (100 + totalPct))
    let allocated = 0
    const lines = active.map((r, i) => {
      // Allocate proportionally; last line takes the rounding remainder so
      // lines always sum exactly to total − subtotal.
      const isLast = i === active.length - 1
      const tax = isLast
        ? amountCents - subtotal - allocated
        : Math.round((subtotal * r.percentage) / 100)
      allocated += isLast ? 0 : tax
      return { displayName: r.displayName, percentage: r.percentage, taxCents: tax }
    })
    return { subtotalCents: subtotal, lines, taxCents: amountCents - subtotal, totalCents: amountCents }
  }

  const lines = active.map((r) => ({
    displayName: r.displayName,
    percentage: r.percentage,
    taxCents: Math.round((amountCents * r.percentage) / 100),
  }))
  const taxCents = lines.reduce((sum, l) => sum + l.taxCents, 0)
  return { subtotalCents: amountCents, lines, taxCents, totalCents: amountCents + taxCents }
}

/** Short display suffix for price labels: "+ HST 13%" / "incl. HST 13%" / ''. */
export function taxSuffix(rates: OrgTaxRate[], scope: TaxScope): string {
  const applicable = ratesForScope(rates, scope)
  if (applicable.length === 0) return ''
  const names = applicable.map((r) => `${r.displayName} ${r.percentage}%`).join(' + ')
  return applicable.some((r) => r.inclusive) ? `incl. ${names}` : `+ ${names}`
}

type Db = ReturnType<typeof createServiceRoleClient>

/** Active rates for an org, DB row → typed. */
export async function getOrgTaxRates(db: Db, orgId: string): Promise<OrgTaxRate[]> {
  const { data } = await db
    .from('org_tax_rates')
    .select('id, display_name, percentage, inclusive, applies_to, stripe_tax_rate_id, created_at')
    .eq('organization_id', orgId)
    .eq('active', true)
    .order('created_at', { ascending: true })
  return (data ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    percentage: Number(r.percentage),
    inclusive: r.inclusive,
    appliesTo: r.applies_to as OrgTaxRate['appliesTo'],
    stripeTaxRateId: r.stripe_tax_rate_id,
    createdAt: r.created_at ?? null,
  }))
}

/** Stripe tax_rate ids to attach to a line item for a given scope. */
export function stripeTaxRateIds(rates: OrgTaxRate[], scope: TaxScope): string[] {
  return ratesForScope(rates, scope)
    .map((r) => r.stripeTaxRateId)
    .filter((id): id is string => !!id)
}
