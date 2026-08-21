'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import {
  generateSingleEliminationSpec,
  generateDoubleEliminationSpec,
  generate6TeamBracketSpec,
  generate14TeamAllPlaySpec,
  generateInflowBracketSpec,
  validateInflowBracket,
  nextPowerOf2,
  type TeamStanding,
  type BracketMatchSpec,
  type InflowSlotRef,
} from '@/lib/bracket'
import { wireLeagueTierInflows, sourceLoserCount, clearInboundRoutes } from '@/lib/tier-inflows'
import { EMPTY_ROSTER, type PlayoffRoster } from '@/lib/playoff-roster'

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getOrgAndRequireAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  return org
}

// ── Standings helper (duplicated from brackets.ts to avoid circular import) ──

async function computeStandings(
  db: ReturnType<typeof createServiceRoleClient>,
  leagueId: string,
  orgId: string
): Promise<TeamStanding[]> {
  const [{ data: teams }, { data: results }] = await Promise.all([

    db.from('teams').select('id, name, division_id, pool_id').eq('league_id', leagueId).eq('organization_id', orgId).eq('status', 'active'),
    db.from('game_results')
      .select('home_score, away_score, status, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status)')
      .eq('organization_id', orgId)
      .eq('status', 'confirmed'),
  ])

  const record: Record<string, TeamStanding> = {}
  for (const t of teams ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    record[t.id] = { teamId: t.id, teamName: t.name, divisionId: t.division_id, poolId: (t as any).pool_id ?? null, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }
  }
  for (const r of results ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = Array.isArray(r.game) ? r.game[0] : r.game as any
    if (!game || game.status !== 'completed' || game.league_id !== leagueId) continue
    const ht = game.home_team_id as string; const at = game.away_team_id as string
    if (!record[ht] || !record[at]) continue
    const hs = r.home_score ?? 0; const as_ = r.away_score ?? 0
    record[ht].pointsFor += hs; record[ht].pointsAgainst += as_
    record[at].pointsFor += as_; record[at].pointsAgainst += hs
    if (hs > as_) { record[ht].wins++; record[at].losses++ }
    else if (as_ > hs) { record[at].wins++; record[ht].losses++ }
    else { record[ht].ties++; record[at].ties++ }
  }
  return Object.values(record)
}

// ── Bracket creation + wiring (internal — bypasses duplicate-per-league check) ─

// Ordinal labels for pool-position scaffold labels
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']

// labelMode: 'block' — Pool A fills first N seeds, then Pool B, etc.
//            'alternating' — A1, B1, A2, B2, …
//            'single' — one pool name, just rank within pool
// perPool: used for block mode; defaults to equal split
function seedLabel(
  seed: number,
  poolNames: string[],
  seedOffset: number,
  labelMode: 'block' | 'alternating' | 'single' = 'alternating',
  perPool?: number
): string {
  const globalSeed = seed + seedOffset
  if (poolNames.length === 0) return `Seed ${globalSeed}`

  if (labelMode === 'single' || poolNames.length === 1) {
    const rank = globalSeed - 1
    return `${ORDINALS[rank] ?? `${rank + 1}th`} - ${poolNames[0]}`
  }

  if (labelMode === 'block') {
    const pp = perPool ?? Math.ceil(16 / poolNames.length)
    const poolIndex = Math.min(Math.floor((globalSeed - 1) / pp), poolNames.length - 1)
    const rank = (globalSeed - 1) % pp
    return `${ORDINALS[rank] ?? `${rank + 1}th`} - ${poolNames[poolIndex]}`
  }

  // alternating
  const poolIndex = (globalSeed - 1) % poolNames.length
  const rank = Math.floor((globalSeed - 1) / poolNames.length)
  return `${ORDINALS[rank] ?? `${rank + 1}th`} - ${poolNames[poolIndex]}`
}

async function insertBracketWithMatches(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  leagueId: string,
  opts: {
    name: string
    bracketType: 'single_elimination' | 'double_elimination' | 'all_play'
    teamsAdvancing: number
    thirdPlaceGame: boolean
    poolNames: string[]  // empty = "Seed N" labels; single = pool_tiers per-pool; multiple = block/alternating
    seedOffset: number   // tier.seed_from - 1; 0 for the top tier
    seedingMethod?: string  // if provided, stored on the bracket row
    labelMode?: 'block' | 'alternating' | 'single'
    perPool?: number  // for block label calculation
    /** Cross-tier drop-down: this bracket also receives another tier's losers. */
    inflow?: {
      count: number
      byeSeeds: number
      /** Scaffold labels for the inflow slots, indexed by inflowIndex - 1. */
      labels: string[]
    }
  }
): Promise<{ bracketId: string | null; error: string | null; inflowSlotIds: { inflowIndex: number; matchId: string; slot: 1 | 2 }[] }> {
  const { name, bracketType, teamsAdvancing, thirdPlaceGame, poolNames, seedOffset, inflow } = opts
  const isAllPlay = bracketType === 'all_play'
  // is6Team: only all_play brackets use the 6-team spec (bracketSize = 6, all teams play R1).
  // A 6-team single_elimination bracket uses bracketSize=8 with 2 byes via generateSingleEliminationSpec.
  const is6Team = isAllPlay && teamsAdvancing === 6
  const actualThirdPlace = bracketType === 'double_elimination' ? false : thirdPlaceGame

  // Inflow brackets size themselves from { direct seeds, inflow, byes }.
  const inflowSpec = inflow
    ? generateInflowBracketSpec({
        directSeeds: teamsAdvancing,
        inflowCount: inflow.count,
        byeSeeds: inflow.byeSeeds,
        thirdPlaceGame: actualThirdPlace,
      })
    : null

  const bracketSize = inflowSpec
    ? inflowSpec.bracketSize
    : (is6Team || (isAllPlay && teamsAdvancing === 14)) ? teamsAdvancing : nextPowerOf2(teamsAdvancing)
  const seedingMethod = opts.seedingMethod ?? (poolNames.length > 0 ? 'pool_results' : 'standings')

  // Insert bracket row in scaffold state — teams are assigned later via "Seed Bracket"

  const { data: bracket, error: bracketError } = await db.from('brackets').insert({
    organization_id: orgId,
    league_id: leagueId,
    name,
    bracket_type: bracketType,
    seeding_method: seedingMethod,
    bracket_size: bracketSize,
    teams_advancing: teamsAdvancing,
    third_place_game: actualThirdPlace,
    status: 'scaffold',
  }).select('id').single()

  if (bracketError || !bracket) return { bracketId: null, error: bracketError?.message ?? 'Failed to create bracket', inflowSlotIds: [] }

  const bracketId = bracket.id as string

  // Generate match spec
  const spec = inflowSpec ?? (isAllPlay
    ? (teamsAdvancing === 14 ? generate14TeamAllPlaySpec() : generate6TeamBracketSpec(actualThirdPlace))
    : bracketType === 'double_elimination'
      ? generateDoubleEliminationSpec(teamsAdvancing)
      : is6Team
        ? generate6TeamBracketSpec()
        : generateSingleEliminationSpec(teamsAdvancing, actualThirdPlace))

  const { bestLoserSlot } = spec

  const allMatchSpecs: BracketMatchSpec[] = [
    ...spec.matches,
    ...(spec.thirdPlaceMatch ? [spec.thirdPlaceMatch] : []),
  ]

  // Insert scaffold matches with null team IDs and pool/seed position labels

  const { data: insertedMatches, error: matchError } = await db.from('bracket_matches').insert(
    allMatchSpecs.map((m: BracketMatchSpec) => {
      const isBestLoserSlot1 = bestLoserSlot?.roundNumber === m.roundNumber && bestLoserSlot?.matchNumber === m.matchNumber && bestLoserSlot?.slot === 1
      const isBestLoserSlot2 = bestLoserSlot?.roundNumber === m.roundNumber && bestLoserSlot?.matchNumber === m.matchNumber && bestLoserSlot?.slot === 2
      return {
        organization_id: orgId,
        bracket_id: bracketId,
        round_number: m.roundNumber,
        match_number: m.matchNumber,
        team1_id: null,
        team2_id: null,
        team1_label: isBestLoserSlot1 ? 'Best Loser'
          : m.team1InflowIndex ? (inflow?.labels[m.team1InflowIndex - 1] ?? 'Drop-down')
          : (m.team1Seed ? seedLabel(m.team1Seed, poolNames, seedOffset, opts.labelMode, opts.perPool) : null),
        team2_label: m.isBye ? 'Bye' : (isBestLoserSlot2 ? 'Best Loser'
          : m.team2InflowIndex ? (inflow?.labels[m.team2InflowIndex - 1] ?? 'Drop-down')
          : (m.team2Seed ? seedLabel(m.team2Seed, poolNames, seedOffset, opts.labelMode, opts.perPool) : null)),
        // Store global seed (e.g. 9 for the 1st seed of Tier 2 with seed_from=9)
        // so the bracket view shows the correct overall rank, not a tier-relative rank.
        team1_seed: isBestLoserSlot1 ? null : (m.team1Seed ? m.team1Seed + seedOffset : null),
        team2_seed: m.isBye ? null : (isBestLoserSlot2 ? null : (m.team2Seed ? m.team2Seed + seedOffset : null)),
        is_bye: m.isBye,
        status: 'pending',
      }
    })
  ).select('id, round_number, match_number')

  if (matchError) return { bracketId: null, error: matchError.message, inflowSlotIds: [] }

  // Build lookup + wire references
  const matchIdLookup = new Map<string, string>()
  for (const m of insertedMatches ?? []) {
    matchIdLookup.set(`${m.round_number}:${m.match_number}`, m.id)
  }

  // Resolve inflow slot positions → inserted match ids (for cross-tier wiring)
  const inflowSlotIds: { inflowIndex: number; matchId: string; slot: 1 | 2 }[] = []
  for (const s of (inflowSpec?.inflowSlots ?? []) as InflowSlotRef[]) {
    const id = matchIdLookup.get(`${s.roundNumber}:${s.matchNumber}`)
    if (id) inflowSlotIds.push({ inflowIndex: s.inflowIndex, matchId: id, slot: s.slot })
  }

  // Winner references
  for (const m of allMatchSpecs) {
    if (m.winnerToRoundNumber === null || m.winnerToMatchNumber === null) continue
    const thisId = matchIdLookup.get(`${m.roundNumber}:${m.matchNumber}`)
    const toId = matchIdLookup.get(`${m.winnerToRoundNumber}:${m.winnerToMatchNumber}`)
    if (!thisId || !toId) continue

    await db.from('bracket_matches')
      .update({ winner_to_match_id: toId, winner_to_slot: m.winnerToSlot })
      .eq('id', thisId)
  }

  // Loser references (double elimination)
  for (const m of allMatchSpecs) {
    if (m.loserToRoundNumber === null || m.loserToMatchNumber === null) continue
    const thisId = matchIdLookup.get(`${m.roundNumber}:${m.matchNumber}`)
    const toId = matchIdLookup.get(`${m.loserToRoundNumber}:${m.loserToMatchNumber}`)
    if (!thisId || !toId) continue

    await db.from('bracket_matches')
      .update({ loser_to_match_id: toId, loser_to_slot: m.loserToSlot })
      .eq('id', thisId)
  }

  return { bracketId, error: null, inflowSlotIds }
}

// ── Playoff roster (Phase A) ──────────────────────────────────────────────────
// The field and its order live on the config so every seed, re-seed and
// regeneration honours the admin's roster instead of the raw standings.

/** Maps a roster onto its two config columns (empty order stored as null). */
function rosterColumns(roster: PlayoffRoster) {
  return {
    custom_seed_order: roster.customOrder && roster.customOrder.length > 0 ? roster.customOrder : null,
    excluded_team_ids: roster.excluded,
  }
}

/** Reads the roster for a league. Missing config or columns → empty roster. */
export async function getPlayoffRoster(leagueId: string): Promise<PlayoffRoster> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  const { data } = await db
    .from('playoff_configs')
    .select('custom_seed_order, excluded_team_ids')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!data) return EMPTY_ROSTER
  return {
    customOrder: data.custom_seed_order ?? null,
    excluded: data.excluded_team_ids ?? [],
  }
}

/**
 * Saves the roster on its own — used from the manage view, where the tiers are
 * already saved and the admin only wants to sit a team out or reorder the
 * field before re-seeding. Requires an existing config (the wizard's
 * "Save & Generate" path persists the roster through savePlayoffConfig).
 */
export async function savePlayoffRoster(input: {
  leagueId: string
  roster: PlayoffRoster
}): Promise<{ error: string | null }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  const { data: config } = await db
    .from('playoff_configs')
    .select('id')
    .eq('league_id', input.leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!config) return { error: 'Save your playoff tiers first — the roster is stored with them.' }

  const { error } = await db
    .from('playoff_configs')
    .update(rosterColumns(input.roster))
    .eq('id', config.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${input.leagueId}/bracket`)
  return { error: null }
}

// ── savePlayoffConfig ─────────────────────────────────────────────────────────

export interface TierInput {
  id?: string   // present when updating an existing tier
  name: string
  seedFrom: number
  seedTo: number
  bracketType: 'single_elimination' | 'double_elimination' | 'all_play'
  thirdPlaceGame: boolean
  /**
   * Index (into this tiers array) of the tier whose first-round losers drop
   * into this tier's bracket. Must point at an EARLIER tier (drop-downs flow
   * downward), which also rules out cycles. null/undefined = no inflow.
   */
  inflowFromTierIndex?: number | null
  /** Top N of this tier's direct seeds skip its entry round (inflow tiers only). */
  byeSeeds?: number
}

export type PoolSeedingMethod = 'standings' | 'pool_results' | 'pool_results_alternating' | 'pool_tiers' | 'pool_results_flat' | 'manual'

export async function savePlayoffConfig(input: {
  leagueId: string
  seedingMethod: PoolSeedingMethod
  advancePerPool?: number[]
  tiers: TierInput[]
  /**
   * Playoff roster (Phase A). Omit to leave a saved roster untouched; pass
   * `{ customOrder: null, excluded: [] }` to reset to standings order.
   */
  roster?: PlayoffRoster
}): Promise<{ error: string | null; configId: string | null }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // Validate tiers: no overlapping seed ranges
  const sortedTiers = [...input.tiers].sort((a, b) => a.seedFrom - b.seedFrom)
  for (let i = 1; i < sortedTiers.length; i++) {
    if (sortedTiers[i].seedFrom <= sortedTiers[i - 1].seedTo) {
      return { error: 'Tier seed ranges must not overlap.', configId: null }
    }
  }

  // Validate inflow references: a tier may only receive losers from an EARLIER
  // tier in the list (drop-downs flow downward — this also rules out cycles).
  for (let i = 0; i < input.tiers.length; i++) {
    const src = input.tiers[i].inflowFromTierIndex
    if (src === null || src === undefined) continue
    if (src < 0 || src >= input.tiers.length || src === i) {
      return { error: `Tier "${input.tiers[i].name}" has an invalid drop-down source.`, configId: null }
    }
    if (src >= i) {
      return { error: `Tier "${input.tiers[i].name}" can only receive losers from a tier above it.`, configId: null }
    }
  }

  // Upsert playoff_config

  const { data: existing } = await db
    .from('playoff_configs')
    .select('id')
    .eq('league_id', input.leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  let configId: string

  if (existing) {
    configId = existing.id

    await db.from('playoff_configs')
      .update({
        seeding_method: input.seedingMethod,
        advance_per_pool: input.advancePerPool ?? null,
        ...(input.roster ? rosterColumns(input.roster) : {}),
      })
      .eq('id', configId)
  } else {

    const { data: created, error: createErr } = await db.from('playoff_configs').insert({
      organization_id: org.id,
      league_id: input.leagueId,
      seeding_method: input.seedingMethod,
      advance_per_pool: input.advancePerPool ?? null,
      ...(input.roster ? rosterColumns(input.roster) : {}),
    }).select('id').single()
    if (createErr || !created) return { error: createErr?.message ?? 'Failed to create config', configId: null }
    configId = created.id
  }

  // Sync tiers: delete tiers not in the new list (only those without a bracket or with no scores)

  const { data: existingTiers } = await db
    .from('playoff_tiers')
    .select('id, bracket_id')
    .eq('config_id', configId)

  const incomingIds = new Set(input.tiers.filter((t) => t.id).map((t) => t.id!))
  for (const et of existingTiers ?? []) {
    if (!incomingIds.has(et.id)) {
      // Delete tier (bracket_id reference cascades via ON DELETE SET NULL)

      await db.from('playoff_tiers').delete().eq('id', et.id)
    }
  }

  // Upsert each tier, collecting ids so inflow references (given as array
  // indexes — new tiers have no id yet) can be resolved in a second pass.
  const tierIds: (string | null)[] = []
  for (let i = 0; i < input.tiers.length; i++) {
    const t = input.tiers[i]
    if (t.id) {

      await db.from('playoff_tiers').update({
        name: t.name,
        sort_order: i,
        seed_from: t.seedFrom,
        seed_to: t.seedTo,
        bracket_type: t.bracketType,
        third_place_game: t.thirdPlaceGame,
        bye_seeds: t.byeSeeds ?? 0,
      }).eq('id', t.id)
      tierIds.push(t.id)
    } else {

      const { data: createdTier } = await db.from('playoff_tiers').insert({
        organization_id: org.id,
        config_id: configId,
        name: t.name,
        sort_order: i,
        seed_from: t.seedFrom,
        seed_to: t.seedTo,
        bracket_type: t.bracketType,
        third_place_game: t.thirdPlaceGame,
        bye_seeds: t.byeSeeds ?? 0,
      }).select('id').single()
      tierIds.push(createdTier?.id ?? null)
    }
  }

  // Second pass: resolve inflow indexes → tier ids.
  for (let i = 0; i < input.tiers.length; i++) {
    const tierId = tierIds[i]
    if (!tierId) continue
    const srcIdx = input.tiers[i].inflowFromTierIndex
    const srcId = srcIdx !== null && srcIdx !== undefined ? tierIds[srcIdx] : null

    await db.from('playoff_tiers').update({
      inflow_from_tier_id: srcId,
      inflow_round: 1, // v1: always the source tier's first round
    }).eq('id', tierId)
  }

  revalidatePath(`/admin/events/${input.leagueId}/bracket`)
  return { error: null, configId }
}

// ── generateAllTierBrackets ───────────────────────────────────────────────────

export async function generateAllTierBrackets(
  leagueId: string
): Promise<{ error: string | null; generated: number; skipped: number }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // Load config + tiers as two separate queries (avoids PostgREST schema-cache
  // issues with newly created tables where relationship joins may not resolve yet)

  const { data: config } = await db
    .from('playoff_configs')
    .select('id, seeding_method, advance_per_pool, custom_seed_order, excluded_team_ids')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!config) return { error: 'No playoff config found. Save the config first.', generated: 0, skipped: 0 }

  const seedingMethod: PoolSeedingMethod = config.seeding_method as PoolSeedingMethod
  const advancePerPool: number[] | null = (config.advance_per_pool as number[] | null) ?? null
  // A hand-ordered field makes position labels ("1st - Pool A") wrong, so a
  // custom order scaffolds with flat seed labels instead. Seeding itself reads
  // the roster from the config again (seedBracket).
  const customOrdered = ((config.custom_seed_order as string[] | null) ?? []).length > 0


  const { data: tiersData } = await db
    .from('playoff_tiers')
    .select('id, name, sort_order, seed_from, seed_to, bracket_type, third_place_game, bracket_id, inflow_from_tier_id, bye_seeds')
    .eq('config_id', config.id)
    .eq('organization_id', org.id)

  const tiers = ((tiersData ?? []) as {
    id: string; name: string; sort_order: number; seed_from: number; seed_to: number
    bracket_type: string; third_place_game: boolean; bracket_id: string | null
    inflow_from_tier_id: string | null; bye_seeds: number
  }[]).sort((a, b) => a.sort_order - b.sort_order)

  if (tiers.length === 0) return { error: 'No tiers defined.', generated: 0, skipped: 0 }

  // Fetch pools — used for scaffold label generation

  const { data: poolsData } = await db
    .from('pools')
    .select('id, name, sort_order')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .order('sort_order', { ascending: true })
  const pools: { id: string; name: string }[] = (poolsData ?? [])
  const allPoolNames: string[] = pools.map((p) => p.name)

  let generated = 0
  let skipped = 0

  // Final bracket id per tier (fresh or retained) — used by the cross-tier
  // wiring pass below. Tiers are sorted by sort_order and inflow sources are
  // validated to come earlier, so a source's bracket exists before its receiver.
  const bracketIdByTier = new Map<string, string>()

  for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
    const tier = tiers[tierIdx]

    // Check if this tier's bracket already has scores recorded → skip regeneration
    if (tier.bracket_id) {

      const { count } = await db
        .from('bracket_matches')
        .select('id', { count: 'exact', head: true })
        .eq('bracket_id', tier.bracket_id)
        .eq('status', 'completed')

      if ((count ?? 0) > 0) {
        bracketIdByTier.set(tier.id, tier.bracket_id)
        skipped++
        continue
      }

      // No scores — safe to delete and regenerate. Clear any routes other
      // brackets point at these matches first (self-FKs have no ON DELETE);
      // the wiring pass below restores them against the fresh matches.
      await clearInboundRoutes(db, tier.bracket_id)
      await db.from('bracket_matches').delete().eq('bracket_id', tier.bracket_id)

      await db.from('brackets').delete().eq('id', tier.bracket_id)

      await db.from('playoff_tiers').update({ bracket_id: null }).eq('id', tier.id)
    }

    const teamsAdvancing = tier.seed_to - tier.seed_from + 1
    // Inflow tiers can be as small as one direct seed (drop-downs fill the rest).
    if (teamsAdvancing < (tier.inflow_from_tier_id ? 1 : 2)) {
      skipped++
      continue
    }

    // ── Cross-tier inflow validation (flexible brackets Phase 2) ────────────
    let inflowOpts: { count: number; byeSeeds: number; labels: string[] } | undefined
    if (tier.inflow_from_tier_id) {
      const srcTier = tiers.find((t) => t.id === tier.inflow_from_tier_id)
      if (!srcTier) {
        return { error: `Tier "${tier.name}": its drop-down source tier no longer exists.`, generated, skipped }
      }
      if (srcTier.sort_order >= tier.sort_order) {
        return { error: `Tier "${tier.name}" can only receive losers from a tier above it.`, generated, skipped }
      }
      if (srcTier.bracket_type !== 'single_elimination') {
        return { error: `Tier "${tier.name}": drop-downs are only supported from single-elimination tiers ("${srcTier.name}" is ${srcTier.bracket_type.replace('_', ' ')}).`, generated, skipped }
      }
      if (tier.bracket_type !== 'single_elimination') {
        return { error: `Tier "${tier.name}": a tier that receives drop-downs must be single elimination.`, generated, skipped }
      }

      const inflowCount = sourceLoserCount(srcTier.seed_to - srcTier.seed_from + 1)
      const shapeError = validateInflowBracket({
        directSeeds: teamsAdvancing,
        inflowCount,
        byeSeeds: tier.bye_seeds ?? 0,
      })
      if (shapeError) {
        return { error: `Tier "${tier.name}": ${shapeError}`, generated, skipped }
      }

      inflowOpts = {
        count: inflowCount,
        byeSeeds: tier.bye_seeds ?? 0,
        // Provisional labels — the wiring pass below replaces them with the
        // precise source match ("Loser of Gold Quarter-Finals M2").
        labels: Array.from({ length: inflowCount }, (_, i) => `${srcTier.name} drop-down ${i + 1}`),
      }
    }

    // Determine scaffold label config based on seeding method
    let tierPoolNames: string[]
    let labelMode: 'block' | 'alternating' | 'single'
    let tierSeedOffset: number
    let perPool: number | undefined

    if (customOrdered) {
      // Flat "Seed N" labels — the admin's order isn't derivable from pools.
      tierPoolNames = []
      labelMode = 'alternating'
      tierSeedOffset = tier.seed_from - 1
    } else if (seedingMethod === 'pool_tiers') {
      // Each tier maps to one pool by index; seeds start at 1 within the tier
      tierPoolNames = allPoolNames[tierIdx] ? [allPoolNames[tierIdx]] : []
      labelMode = 'single'
      tierSeedOffset = 0
    } else if (seedingMethod === 'pool_results_alternating') {
      tierPoolNames = allPoolNames
      labelMode = 'alternating'
      tierSeedOffset = tier.seed_from - 1
    } else if (seedingMethod === 'pool_results') {
      tierPoolNames = allPoolNames
      labelMode = 'block'
      tierSeedOffset = tier.seed_from - 1
      if (advancePerPool && allPoolNames.length > 0) {
        perPool = advancePerPool[0]
      } else {
        perPool = allPoolNames.length > 0 ? Math.ceil(teamsAdvancing / allPoolNames.length) : undefined
      }
    } else if (seedingMethod === 'pool_results_flat') {
      // Cross-pool overall ranking — scaffold with flat seed labels (no pool anchor)
      tierPoolNames = []
      labelMode = 'alternating'
      tierSeedOffset = tier.seed_from - 1
    } else {
      tierPoolNames = allPoolNames.length > 0 ? allPoolNames : []
      labelMode = 'alternating'
      tierSeedOffset = tier.seed_from - 1
    }

    // Brackets are scaffolded with position labels (e.g. "1st - Pool A").
    // Admins seed with real teams via "Seed Bracket" once all pool scores are final.
    const { bracketId, error } = await insertBracketWithMatches(db, org.id, leagueId, {
      name: tier.name,
      bracketType: tier.bracket_type as 'single_elimination' | 'double_elimination' | 'all_play',
      teamsAdvancing,
      thirdPlaceGame: tier.third_place_game,
      poolNames: tierPoolNames,
      seedOffset: tierSeedOffset,
      seedingMethod,
      labelMode,
      perPool,
      inflow: inflowOpts,
    })

    if (error || !bracketId) { skipped++; continue }


    await db.from('playoff_tiers').update({ bracket_id: bracketId }).eq('id', tier.id)
    bracketIdByTier.set(tier.id, bracketId)
    generated++
  }

  // ── Cross-tier wiring pass (flexible brackets Phase 2) ────────────────────
  // Point each source tier's first-round losers at the receiving tier's inflow
  // slots. Runs after ALL brackets exist so it also repairs routes when one
  // side regenerated and the other was kept (scores already recorded).
  const wire = await wireLeagueTierInflows(db, org.id, leagueId)
  if (wire.error) return { error: wire.error, generated, skipped }

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null, generated, skipped }
}

// ── reseedTierBracket ─────────────────────────────────────────────────────────
// Regenerates a single tier bracket from current standings.
// Blocked if any matches have scores recorded.

export async function reseedTierBracket(
  tierId: string,
  leagueId: string
): Promise<{ error?: string }> {
  return generateAllTierBrackets(leagueId)
    .then((r) => r.error ? { error: r.error } : {})
}

// ── deletePlayoffConfig ───────────────────────────────────────────────────────
// Removes the config + tiers. Does NOT delete generated brackets
// (those are managed individually via deleteBracket).

export async function deletePlayoffConfig(leagueId: string): Promise<{ error?: string }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()


  const { data: config } = await db
    .from('playoff_configs')
    .select('id')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!config) return {}


  await db.from('playoff_tiers').delete().eq('config_id', config.id)

  await db.from('playoff_configs').delete().eq('id', config.id)

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  return {}
}
