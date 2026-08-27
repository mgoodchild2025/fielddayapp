/**
 * Headline price to display for an event. Returns cents.
 *
 * Drop-in events lead with the per-session fee — that's what most players
 * pay — falling back to the season-pass price when no session fee is set.
 * Everything else shows `price_cents`, with the drop-in fee as the fallback
 * for legacy rows that only have one.
 */
export function eventDisplayPriceCents(league: {
  price_cents?: number | null
  drop_in_price_cents?: number | null
  event_type?: string | null
}): number {
  const season = league.price_cents ?? 0
  const dropIn = league.drop_in_price_cents ?? 0
  if (league.event_type === 'drop_in') return dropIn > 0 ? dropIn : season
  return season > 0 ? season : dropIn
}

/** Formats the display price as e.g. "Free", "$15 CAD / session", "$400 CAD / team". */
export function formatEventPrice(league: {
  price_cents?: number | null
  drop_in_price_cents?: number | null
  currency?: string | null
  payment_mode?: string | null
  event_type?: string | null
}): string {
  const cents = eventDisplayPriceCents(league)
  if (cents === 0) return 'Free'
  // Say who (or what) the price is for — callers that don't know the payment
  // mode get the bare amount, same as before.
  const isSessionPrice = league.event_type === 'drop_in' && (league.drop_in_price_cents ?? 0) > 0
  const unit = isSessionPrice ? ' / session'
    : league.payment_mode === 'per_team' ? ' / team'
    : league.payment_mode ? ' / player' : ''
  return `$${(cents / 100).toFixed(0)} ${(league.currency ?? 'CAD').toUpperCase()}${unit}`
}
