import type { createServiceRoleClient } from '@/lib/supabase/service'
import { generateInflowBracketSpec, getRoundName, nextPowerOf2 } from '@/lib/bracket'

/**
 * Cross-tier drop-down helpers (flexible brackets Phase 2).
 *
 * A tier can receive the first-round losers of an earlier tier
 * (playoff_tiers.inflow_from_tier_id). These helpers are shared by the config
 * generator and the per-bracket scaffold/seed actions so the receiving
 * bracket's shape and the cross-bracket loser routes survive every rebuild.
 */

type Db = ReturnType<typeof createServiceRoleClient>

/** First-round matches of a single-elim tier that produce a real loser (byes don't). */
export function sourceLoserCount(teams: number): number {
  const size = nextPowerOf2(teams)
  return size / 2 - (size - teams)
}

export interface InflowContext {
  tierId: string
  /** Direct seeds in the receiving tier (its seed range size). */
  directSeeds: number
  byeSeeds: number
  inflowCount: number
}

/**
 * When the given bracket belongs to a tier that RECEIVES drop-downs, returns
 * the shape needed to regenerate it with generateInflowBracketSpec. Null for
 * ordinary brackets.
 */
export async function getInflowContext(db: Db, bracketId: string): Promise<InflowContext | null> {
  const { data: tier } = await db
    .from('playoff_tiers')
    .select('id, seed_from, seed_to, bye_seeds, inflow_from_tier_id')
    .eq('bracket_id', bracketId)
    .maybeSingle()
  if (!tier?.inflow_from_tier_id) return null

  const { data: src } = await db
    .from('playoff_tiers')
    .select('seed_from, seed_to')
    .eq('id', tier.inflow_from_tier_id)
    .maybeSingle()
  if (!src) return null

  return {
    tierId: tier.id,
    directSeeds: tier.seed_to - tier.seed_from + 1,
    byeSeeds: tier.bye_seeds ?? 0,
    inflowCount: sourceLoserCount(src.seed_to - src.seed_from + 1),
  }
}

/** Build the receiving bracket's spec from its inflow context. */
export function inflowSpecFromContext(ctx: InflowContext, thirdPlaceGame: boolean) {
  return generateInflowBracketSpec({
    directSeeds: ctx.directSeeds,
    inflowCount: ctx.inflowCount,
    byeSeeds: ctx.byeSeeds,
    thirdPlaceGame,
  })
}

/**
 * Null out winner/loser routes in OTHER brackets that point INTO this
 * bracket's matches. The bracket_matches self-FKs have no ON DELETE clause, so
 * deleting referenced rows (scaffold/seed rebuilds, bracket deletion) would
 * otherwise violate the constraint — and stale routes must not survive a
 * rebuild anyway. wireLeagueTierInflows() restores them afterwards.
 */
export async function clearInboundRoutes(db: Db, bracketId: string): Promise<void> {
  const { data: own } = await db
    .from('bracket_matches')
    .select('id')
    .eq('bracket_id', bracketId)
  const ids = (own ?? []).map((m) => m.id)
  if (ids.length === 0) return

  await db.from('bracket_matches')
    .update({ loser_to_match_id: null, loser_to_slot: null })
    .neq('bracket_id', bracketId)
    .in('loser_to_match_id', ids)

  await db.from('bracket_matches')
    .update({ winner_to_match_id: null, winner_to_slot: null })
    .neq('bracket_id', bracketId)
    .in('winner_to_match_id', ids)
}

/**
 * Idempotent cross-tier wiring pass for a league: for every tier that receives
 * drop-downs (and whose bracket + source bracket both exist), point the source
 * tier's first-round losers at the receiver's inflow slots and label them
 * ("Loser of Gold Quarter-Finals M2"). Safe to re-run after any rebuild of
 * either side.
 */
export async function wireLeagueTierInflows(
  db: Db,
  orgId: string,
  leagueId: string,
): Promise<{ error: string | null }> {
  const { data: config } = await db
    .from('playoff_configs')
    .select('id')
    .eq('league_id', leagueId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!config) return { error: null }

  const { data: tiersData } = await db
    .from('playoff_tiers')
    .select('id, name, seed_from, seed_to, bracket_id, inflow_from_tier_id')
    .eq('config_id', config.id)
    .eq('organization_id', orgId)
  const tiers = tiersData ?? []

  for (const tier of tiers) {
    if (!tier.inflow_from_tier_id || !tier.bracket_id) continue
    const srcTier = tiers.find((t) => t.id === tier.inflow_from_tier_id)
    if (!srcTier?.bracket_id) continue

    // Source: first-round matches that produce a real loser, in match order.
    const { data: srcMatchesData } = await db
      .from('bracket_matches')
      .select('id, round_number, match_number, is_bye')
      .eq('bracket_id', srcTier.bracket_id)
      .order('match_number', { ascending: true })
    const srcAll = srcMatchesData ?? []
    const srcFirstRound = Math.max(...srcAll.filter((m) => m.round_number < 100).map((m) => m.round_number), 0)
    const srcMatches = srcAll.filter((m) => m.round_number === srcFirstRound && !m.is_bye)

    // Receiver: entry-round slots without a seed or team, in (match, slot)
    // order — matches the generator's inflow-index assignment exactly.
    const { data: recvMatchesData } = await db
      .from('bracket_matches')
      .select('id, round_number, match_number, team1_seed, team2_seed')
      .eq('bracket_id', tier.bracket_id)
      .order('match_number', { ascending: true })
    const recvAll = recvMatchesData ?? []
    const entryRound = Math.max(...recvAll.filter((m) => m.round_number < 100).map((m) => m.round_number), 0)
    const inflowSlots: { matchId: string; slot: 1 | 2 }[] = []
    for (const m of recvAll.filter((r) => r.round_number === entryRound)) {
      if (m.team1_seed === null) inflowSlots.push({ matchId: m.id, slot: 1 })
      if (m.team2_seed === null) inflowSlots.push({ matchId: m.id, slot: 2 })
    }

    if (srcMatches.length !== inflowSlots.length) {
      return {
        error: `Tier "${tier.name}": the ${srcTier.name} bracket produces ${srcMatches.length} first-round losers but ${tier.name} has ${inflowSlots.length} drop-down slots. Regenerate both tiers together.`,
      }
    }

    const srcBracketSize = nextPowerOf2(srcTier.seed_to - srcTier.seed_from + 1)
    const srcRoundName = getRoundName(srcFirstRound, srcBracketSize)
    for (let i = 0; i < srcMatches.length; i++) {
      const src = srcMatches[i]
      const slot = inflowSlots[i]

      await db.from('bracket_matches')
        .update({ loser_to_match_id: slot.matchId, loser_to_slot: slot.slot })
        .eq('id', src.id)

      // Label the receiving slot when it's still unfilled (scaffold/seeding).
      const label = `Loser of ${srcTier.name} ${srcRoundName} M${src.match_number}`
      const { data: slotRow } = await db
        .from('bracket_matches')
        .select('team1_id, team2_id')
        .eq('id', slot.matchId)
        .single()
      const teamAssigned = slot.slot === 1 ? slotRow?.team1_id : slotRow?.team2_id
      if (!teamAssigned) {
        await db.from('bracket_matches')
          .update(slot.slot === 1 ? { team1_label: label } : { team2_label: label })
          .eq('id', slot.matchId)
      }
    }
  }

  return { error: null }
}
