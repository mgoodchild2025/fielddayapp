/**
 * Headline price to display for an event.
 *
 * Drop-in / pickup events keep their fee in `drop_in_price_cents` — the
 * season-pass `price_cents` is often 0 for them — so fall back to the drop-in
 * fee when there is no season price. Returns cents.
 */
export function eventDisplayPriceCents(league: {
  price_cents?: number | null
  drop_in_price_cents?: number | null
}): number {
  const season = league.price_cents ?? 0
  if (season > 0) return season
  return league.drop_in_price_cents ?? 0
}

/** Formats the display price as e.g. "Free" or "$15 CAD". */
export function formatEventPrice(league: {
  price_cents?: number | null
  drop_in_price_cents?: number | null
  currency?: string | null
}): string {
  const cents = eventDisplayPriceCents(league)
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(0)} ${(league.currency ?? 'CAD').toUpperCase()}`
}
