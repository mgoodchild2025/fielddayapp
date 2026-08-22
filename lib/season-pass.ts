import type { createServiceRoleClient } from '@/lib/supabase/service'

/**
 * Season-pass pricing for drop-in events.
 *
 * One rule, one place: the pass price is the full price scaled by how much of
 * the season is left, rounded UP to the next dollar, floored at the
 * single-session price (with one session left, the "pass" IS that session —
 * the floor keeps the two tickets from inverting). Cancelled sessions shrink
 * the TOTAL, not just the remainder, so a rained-out night doesn't quietly
 * discount everyone's pass.
 *
 * Every surface that shows or charges the pass price calls this — the event
 * page, the register flow, and the Stripe checkout route — so display and
 * charge can never disagree, and the client never supplies an amount.
 * Applies at purchase time only; passes already sold never reprice.
 */

export interface SeasonPassQuoteInput {
  /** The full season-pass price (leagues.price_cents). */
  fullPriceCents: number
  /** All non-cancelled sessions in the event. */
  totalSessions: number
  /** Non-cancelled sessions that haven't started yet. */
  remainingSessions: number
  /** Price floor — the single-session price (leagues.drop_in_price_cents). */
  floorCents?: number | null
}

/** Round up to the next whole dollar ($73.33 reads as broken; $74 as intended). */
function ceilToDollar(cents: number): number {
  return Math.ceil(cents / 100) * 100
}

export function seasonPassPriceCents(input: SeasonPassQuoteInput): number {
  const { fullPriceCents, totalSessions, floorCents } = input
  if (fullPriceCents <= 0) return 0
  // No sessions scheduled yet → nothing to prorate against.
  if (totalSessions <= 0) return fullPriceCents

  const remaining = Math.min(Math.max(input.remainingSessions, 0), totalSessions)
  if (remaining >= totalSessions) return fullPriceCents

  let price = ceilToDollar((fullPriceCents * remaining) / totalSessions)
  if (floorCents != null && floorCents > 0) price = Math.max(price, floorCents)
  return Math.min(price, fullPriceCents)
}

export interface SeasonPassQuote {
  priceCents: number
  fullPriceCents: number
  totalSessions: number
  remainingSessions: number
  /** True when the quote is below the full price (worth showing the strikethrough). */
  prorated: boolean
}

type Db = ReturnType<typeof createServiceRoleClient>

/**
 * Loads the session counts and returns the pass quote for a drop-in event.
 * When `prorate` is false this still returns counts (for "covers N sessions"
 * copy) but the price is simply the full price.
 */
export async function getSeasonPassQuote(
  db: Db,
  orgId: string,
  leagueId: string,
  opts: { fullPriceCents: number; prorate: boolean; floorCents?: number | null }
): Promise<SeasonPassQuote> {
  const nowIso = new Date().toISOString()
  const [{ count: total }, { count: remaining }] = await Promise.all([
    db.from('event_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId).eq('organization_id', orgId)
      .neq('status', 'cancelled'),
    db.from('event_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId).eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .gte('scheduled_at', nowIso),
  ])

  const totalSessions = total ?? 0
  const remainingSessions = remaining ?? 0
  const priceCents = opts.prorate
    ? seasonPassPriceCents({
        fullPriceCents: opts.fullPriceCents,
        totalSessions,
        remainingSessions,
        floorCents: opts.floorCents,
      })
    : opts.fullPriceCents

  return {
    priceCents,
    fullPriceCents: opts.fullPriceCents,
    totalSessions,
    remainingSessions,
    prorated: priceCents < opts.fullPriceCents,
  }
}
