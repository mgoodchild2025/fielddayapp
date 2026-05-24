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
  nextPowerOf2,
  type TeamStanding,
  type BracketMatchSpec,
} from '@/lib/bracket'

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('teams').select('id, name, division_id, pool_id').eq('league_id', leagueId).eq('organization_id', orgId).eq('status', 'active'),
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
  }
): Promise<{ bracketId: string | null; error: string | null }> {
  const { name, bracketType, teamsAdvancing, thirdPlaceGame, poolNames, seedOffset } = opts
  const isAllPlay = bracketType === 'all_play'
  // is6Team: only all_play brackets use the 6-team spec (bracketSize = 6, all teams play R1).
  // A 6-team single_elimination bracket uses bracketSize=8 with 2 byes via generateSingleEliminationSpec.
  const is6Team = isAllPlay && teamsAdvancing === 6
  const bracketSize = (is6Team || (isAllPlay && teamsAdvancing === 14)) ? teamsAdvancing : nextPowerOf2(teamsAdvancing)
  const actualThirdPlace = (bracketType === 'double_elimination' || isAllPlay) ? false : thirdPlaceGame
  const seedingMethod = opts.seedingMethod ?? (poolNames.length > 0 ? 'pool_results' : 'standings')

  // Insert bracket row in scaffold state — teams are assigned later via "Seed Bracket"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bracket, error: bracketError } = await (db as any).from('brackets').insert({
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

  if (bracketError || !bracket) return { bracketId: null, error: bracketError?.message ?? 'Failed to create bracket' }

  const bracketId = bracket.id as string

  // Generate match spec
  const spec = isAllPlay
    ? (teamsAdvancing === 14 ? generate14TeamAllPlaySpec() : generate6TeamBracketSpec())
    : bracketType === 'double_elimination'
      ? generateDoubleEliminationSpec(teamsAdvancing)
      : is6Team
        ? generate6TeamBracketSpec()
        : generateSingleEliminationSpec(teamsAdvancing, actualThirdPlace)

  const { bestLoserSlot } = spec

  const allMatchSpecs: BracketMatchSpec[] = [
    ...spec.matches,
    ...(spec.thirdPlaceMatch ? [spec.thirdPlaceMatch] : []),
  ]

  // Insert scaffold matches with null team IDs and pool/seed position labels
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedMatches, error: matchError } = await (db as any).from('bracket_matches').insert(
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
        team1_label: isBestLoserSlot1 ? 'Best Loser' : (m.team1Seed ? seedLabel(m.team1Seed, poolNames, seedOffset, opts.labelMode, opts.perPool) : null),
        team2_label: m.isBye ? 'Bye' : (isBestLoserSlot2 ? 'Best Loser' : (m.team2Seed ? seedLabel(m.team2Seed, poolNames, seedOffset, opts.labelMode, opts.perPool) : null)),
        // Store global seed (e.g. 9 for the 1st seed of Tier 2 with seed_from=9)
        // so the bracket view shows the correct overall rank, not a tier-relative rank.
        team1_seed: isBestLoserSlot1 ? null : (m.team1Seed ? m.team1Seed + seedOffset : null),
        team2_seed: m.isBye ? null : (isBestLoserSlot2 ? null : (m.team2Seed ? m.team2Seed + seedOffset : null)),
        is_bye: m.isBye,
        status: 'pending',
      }
    })
  ).select('id, round_number, match_number')

  if (matchError) return { bracketId: null, error: matchError.message }

  // Build lookup + wire references
  const matchIdLookup = new Map<string, string>()
  for (const m of insertedMatches ?? []) {
    matchIdLookup.set(`${m.round_number}:${m.match_number}`, m.id)
  }

  // Winner references
  for (const m of allMatchSpecs) {
    if (m.winnerToRoundNumber === null || m.winnerToMatchNumber === null) continue
    const thisId = matchIdLookup.get(`${m.roundNumber}:${m.matchNumber}`)
    const toId = matchIdLookup.get(`${m.winnerToRoundNumber}:${m.winnerToMatchNumber}`)
    if (!thisId || !toId) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('bracket_matches')
      .update({ winner_to_match_id: toId, winner_to_slot: m.winnerToSlot })
      .eq('id', thisId)
  }

  // Loser references (double elimination)
  for (const m of allMatchSpecs) {
    if (m.loserToRoundNumber === null || m.loserToMatchNumber === null) continue
    const thisId = matchIdLookup.get(`${m.roundNumber}:${m.matchNumber}`)
    const toId = matchIdLookup.get(`${m.loserToRoundNumber}:${m.loserToMatchNumber}`)
    if (!thisId || !toId) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('bracket_matches')
      .update({ loser_to_match_id: toId, loser_to_slot: m.loserToSlot })
      .eq('id', thisId)
  }

  return { bracketId, error: null }
}

// ── savePlayoffConfig ─────────────────────────────────────────────────────────

export interface TierInput {
  id?: string   // present when updating an existing tier
  name: string
  seedFrom: number
  seedTo: number
  bracketType: 'single_elimination' | 'double_elimination' | 'all_play'
  thirdPlaceGame: boolean
}

export type PoolSeedingMethod = 'standings' | 'pool_results' | 'pool_results_alternating' | 'pool_tiers' | 'pool_results_flat' | 'manual'

export async function savePlayoffConfig(input: {
  leagueId: string
  seedingMethod: PoolSeedingMethod
  advancePerPool?: number[]
  tiers: TierInput[]
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

  // Upsert playoff_config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (db as any)
    .from('playoff_configs')
    .select('id')
    .eq('league_id', input.leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  let configId: string

  if (existing) {
    configId = existing.id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('playoff_configs')
      .update({
        seeding_method: input.seedingMethod,
        advance_per_pool: input.advancePerPool ?? null,
      })
      .eq('id', configId)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error: createErr } = await (db as any).from('playoff_configs').insert({
      organization_id: org.id,
      league_id: input.leagueId,
      seeding_method: input.seedingMethod,
      advance_per_pool: input.advancePerPool ?? null,
    }).select('id').single()
    if (createErr || !created) return { error: createErr?.message ?? 'Failed to create config', configId: null }
    configId = created.id
  }

  // Sync tiers: delete tiers not in the new list (only those without a bracket or with no scores)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingTiers } = await (db as any)
    .from('playoff_tiers')
    .select('id, bracket_id')
    .eq('config_id', configId)

  const incomingIds = new Set(input.tiers.filter((t) => t.id).map((t) => t.id!))
  for (const et of existingTiers ?? []) {
    if (!incomingIds.has(et.id)) {
      // Delete tier (bracket_id reference cascades via ON DELETE SET NULL)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('playoff_tiers').delete().eq('id', et.id)
    }
  }

  // Upsert each tier
  for (let i = 0; i < input.tiers.length; i++) {
    const t = input.tiers[i]
    if (t.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('playoff_tiers').update({
        name: t.name,
        sort_order: i,
        seed_from: t.seedFrom,
        seed_to: t.seedTo,
        bracket_type: t.bracketType,
        third_place_game: t.thirdPlaceGame,
      }).eq('id', t.id)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('playoff_tiers').insert({
        organization_id: org.id,
        config_id: configId,
        name: t.name,
        sort_order: i,
        seed_from: t.seedFrom,
        seed_to: t.seedTo,
        bracket_type: t.bracketType,
        third_place_game: t.thirdPlaceGame,
      })
    }
  }

  revalidatePath(`/admin/events/${input.leagueId}/bracket`)
  return { error: null, configId }
}

// ── generateAllTierBrackets ───────────────────────────────────────────────────

export async function generateAllTierBrackets(
  leagueId: string,
  seedOverrides?: Record<number, string>  // global seed# → teamId overrides (for manual seeding)
): Promise<{ error: string | null; generated: number; skipped: number }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // Load config + tiers as two separate queries (avoids PostgREST schema-cache
  // issues with newly created tables where relationship joins may not resolve yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: config } = await (db as any)
    .from('playoff_configs')
    .select('id, seeding_method, advance_per_pool')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!config) return { error: 'No playoff config found. Save the config first.', generated: 0, skipped: 0 }

  const seedingMethod: PoolSeedingMethod = config.seeding_method as PoolSeedingMethod
  const advancePerPool: number[] | null = config.advance_per_pool ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tiersData } = await (db as any)
    .from('playoff_tiers')
    .select('id, name, sort_order, seed_from, seed_to, bracket_type, third_place_game, bracket_id')
    .eq('config_id', config.id)
    .eq('organization_id', org.id)

  const tiers = ((tiersData ?? []) as {
    id: string; name: string; sort_order: number; seed_from: number; seed_to: number
    bracket_type: string; third_place_game: boolean; bracket_id: string | null
  }[]).sort((a, b) => a.sort_order - b.sort_order)

  if (tiers.length === 0) return { error: 'No tiers defined.', generated: 0, skipped: 0 }

  // Fetch pools — used for scaffold label generation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: poolsData } = await (db as any)
    .from('pools')
    .select('id, name, sort_order')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .order('sort_order', { ascending: true })
  const pools: { id: string; name: string }[] = (poolsData ?? [])
  const allPoolNames: string[] = pools.map((p) => p.name)

  let generated = 0
  let skipped = 0

  for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
    const tier = tiers[tierIdx]

    // Check if this tier's bracket already has scores recorded → skip regeneration
    if (tier.bracket_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (db as any)
        .from('bracket_matches')
        .select('id', { count: 'exact', head: true })
        .eq('bracket_id', tier.bracket_id)
        .eq('status', 'completed')

      if ((count ?? 0) > 0) {
        skipped++
        continue
      }

      // No scores — safe to delete and regenerate
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('bracket_matches').delete().eq('bracket_id', tier.bracket_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('brackets').delete().eq('id', tier.bracket_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('playoff_tiers').update({ bracket_id: null }).eq('id', tier.id)
    }

    const teamsAdvancing = tier.seed_to - tier.seed_from + 1
    if (teamsAdvancing < 2) {
      skipped++
      continue
    }

    // Determine scaffold label config based on seeding method
    let tierPoolNames: string[]
    let labelMode: 'block' | 'alternating' | 'single'
    let tierSeedOffset: number
    let perPool: number | undefined

    if (seedingMethod === 'pool_tiers') {
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
    })

    if (error || !bracketId) { skipped++; continue }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('playoff_tiers').update({ bracket_id: bracketId }).eq('id', tier.id)
    generated++
  }

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null, generated, skipped }
}

// ── reseedTierBracket ─────────────────────────────────────────────────────────
// Regenerates a single tier bracket from current standings.
// Blocked if any matches have scores recorded.

export async function reseedTierBracket(
  tierId: string,
  leagueId: string,
  seedOverrides?: Record<number, string>
): Promise<{ error?: string }> {
  return generateAllTierBrackets(leagueId, seedOverrides)
    .then((r) => r.error ? { error: r.error } : {})
}

// ── deletePlayoffConfig ───────────────────────────────────────────────────────
// Removes the config + tiers. Does NOT delete generated brackets
// (those are managed individually via deleteBracket).

export async function deletePlayoffConfig(leagueId: string): Promise<{ error?: string }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: config } = await (db as any)
    .from('playoff_configs')
    .select('id')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!config) return {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('playoff_tiers').delete().eq('config_id', config.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('playoff_configs').delete().eq('id', config.id)

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  return {}
}
