import { getSeasonPassQuote } from '@/lib/season-pass'
import type { createServiceRoleClient } from '@/lib/supabase/service'

type Db = ReturnType<typeof createServiceRoleClient>

export interface PriceableLeague {
  price_cents: number | null
  drop_in_price_cents?: number | null
  early_bird_price_cents?: number | null
  early_bird_deadline?: string | null
  event_type?: string | null
  season_pass_prorate?: boolean | null
}

/**
 * What a registration costs before discounts and tax — the ONE server-side
 * price. The Stripe checkout and the offline (e-transfer/cash/cheque) actions
 * both use it, so a card payer and an offline payer always owe the same, and
 * nothing the browser sends can change it.
 *  - drop-in session → drop_in_price_cents (falls back to price_cents)
 *  - early bird (before the deadline, not drop-ins) → early_bird_price_cents
 *  - season pass on a drop-in event with proration → the prorated quote
 */
export async function registrationBasePriceCents(
  db: Db,
  orgId: string,
  leagueId: string,
  league: PriceableLeague,
  registrationType: string | null | undefined,
): Promise<{ priceCents: number; isDropIn: boolean; earlyBirdActive: boolean; passQuoteLabel: string | null }> {
  const isDropIn = registrationType === 'drop_in'
  const earlyBirdActive = !isDropIn && league.early_bird_price_cents != null && league.early_bird_deadline != null && new Date() < new Date(league.early_bird_deadline)
  let priceCents: number = isDropIn
    ? (league.drop_in_price_cents ?? league.price_cents ?? 0)
    : (earlyBirdActive ? league.early_bird_price_cents! : (league.price_cents ?? 0))

  let passQuoteLabel: string | null = null
  if (!isDropIn && league.event_type === 'drop_in' && league.season_pass_prorate && priceCents > 0) {
    const quote = await getSeasonPassQuote(db, orgId, leagueId, {
      fullPriceCents: priceCents,
      prorate: true,
      floorCents: league.drop_in_price_cents ?? null,
    })
    priceCents = quote.priceCents
    if (quote.prorated) passQuoteLabel = `Season pass — ${quote.remainingSessions} remaining session${quote.remainingSessions !== 1 ? 's' : ''}`
  }
  return { priceCents, isDropIn, earlyBirdActive, passQuoteLabel }
}

/**
 * Re-validate a discount code server-side and apply it (never trust a
 * client-computed amount). Invalid / expired / used-up / wrong-scope codes
 * apply nothing.
 */
export async function applyDiscountCode(
  db: Db,
  orgId: string,
  discountId: string | null | undefined,
  priceCents: number,
  scope: 'leagues' | 'dropins',
): Promise<{ priceCents: number; discount: { id: string; type: string; value: number; cents: number } | null }> {
  if (!discountId || priceCents <= 0) return { priceCents, discount: null }
  const { data: d } = await db
    .from('discount_codes')
    .select('id, type, value, active, expires_at, max_uses, use_count, applies_to')
    .eq('id', discountId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (
    !d || !d.active ||
    (d.expires_at && new Date(d.expires_at) <= new Date()) ||
    (d.max_uses && d.use_count >= d.max_uses) ||
    !(d.applies_to === 'all' || d.applies_to === scope)
  ) return { priceCents, discount: null }
  const reduction = d.type === 'percent'
    ? Math.round(priceCents * d.value / 100)
    : Math.min(d.value * 100, priceCents)
  return { priceCents: Math.max(0, priceCents - reduction), discount: { id: d.id, type: d.type, value: d.value, cents: reduction } }
}
