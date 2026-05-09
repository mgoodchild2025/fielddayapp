'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import {
  generateSingleEliminationSpec,
  generateDoubleEliminationSpec,
  seedFromStandings,
  seedFromDivisionStandings,
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
    db.from('teams').select('id, name, division_id').eq('league_id', leagueId).eq('organization_id', orgId).eq('status', 'active'),
    db.from('game_results')
      .select('home_score, away_score, status, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status)')
      .eq('organization_id', orgId)
      .eq('status', 'confirmed'),
  ])

  const record: Record<string, TeamStanding> = {}
  for (const t of teams ?? []) {
    record[t.id] = { teamId: t.id, teamName: t.name, divisionId: t.division_id, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }
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

async function insertBracketWithMatches(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  leagueId: string,
  opts: {
    name: string
    bracketType: 'single_elimination' | 'double_elimination'
    teamsAdvancing: number
    thirdPlaceGame: boolean
    seededTeams: TeamStanding[]  // pre-sliced + ordered for this tier
  }
): Promise<{ bracketId: string | null; error: string | null }> {
  const { name, bracketType, teamsAdvancing, thirdPlaceGame, seededTeams } = opts
  const bracketSize = nextPowerOf2(teamsAdvancing)
  const actualThirdPlace = bracketType === 'double_elimination' ? false : thirdPlaceGame

  // Insert bracket row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bracket, error: bracketError } = await (db as any).from('brackets').insert({
    organization_id: orgId,
    league_id: leagueId,
    name,
    bracket_type: bracketType,
    seeding_method: 'standings',
    bracket_size: bracketSize,
    teams_advancing: teamsAdvancing,
    third_place_game: actualThirdPlace,
    status: 'seeding',
  }).select('id').single()

  if (bracketError || !bracket) return { bracketId: null, error: bracketError?.message ?? 'Failed to create bracket' }

  const bracketId = bracket.id as string

  // Generate match spec
  const spec = bracketType === 'double_elimination'
    ? generateDoubleEliminationSpec(teamsAdvancing)
    : generateSingleEliminationSpec(teamsAdvancing, actualThirdPlace)

  const allMatchSpecs: BracketMatchSpec[] = [
    ...spec.matches,
    ...(spec.thirdPlaceMatch ? [spec.thirdPlaceMatch] : []),
  ]

  const seedMap = new Map(seededTeams.map((t, i) => [i + 1, t.teamId]))

  // Insert matches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedMatches, error: matchError } = await (db as any).from('bracket_matches').insert(
    allMatchSpecs.map((m: BracketMatchSpec) => {
      const isWbFirstRound = m.team1Seed !== null || m.team2Seed !== null
      const team1Id = m.team1Seed ? (seedMap.get(m.team1Seed) ?? null) : null
      const team2Id = m.isBye ? null : (m.team2Seed ? (seedMap.get(m.team2Seed) ?? null) : null)
      return {
        organization_id: orgId,
        bracket_id: bracketId,
        round_number: m.roundNumber,
        match_number: m.matchNumber,
        team1_id: team1Id,
        team2_id: team2Id,
        team1_label: null,
        team2_label: null,
        team1_seed: m.team1Seed,
        team2_seed: m.isBye ? null : m.team2Seed,
        is_bye: m.isBye,
        status: m.isBye ? 'bye' : (isWbFirstRound && m.team1Seed && (m.team2Seed || m.isBye) ? 'ready' : 'pending'),
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

  // Auto-advance byes
  for (const m of allMatchSpecs.filter((m) => m.isBye)) {
    const matchId = matchIdLookup.get(`${m.roundNumber}:${m.matchNumber}`)
    if (!matchId || !m.team1Seed) continue
    const winnerId = seedMap.get(m.team1Seed)
    if (!winnerId) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: match } = await (db as any).from('bracket_matches').select('winner_to_match_id, winner_to_slot').eq('id', matchId).single()
    if (!match?.winner_to_match_id) continue
    const updateField = match.winner_to_slot === 1 ? 'team1_id' : 'team2_id'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nextMatch } = await (db as any).from('bracket_matches').select('id, team1_id, team2_id').eq('id', match.winner_to_match_id).single()
    if (!nextMatch) continue
    const otherField = match.winner_to_slot === 1 ? 'team2_id' : 'team1_id'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('bracket_matches')
      .update({ [updateField]: winnerId, winner_team_id: winnerId, status: nextMatch[otherField] ? 'ready' : 'pending' })
      .eq('id', match.winner_to_match_id)
    // Mark bye match completed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('bracket_matches').update({ winner_team_id: winnerId, status: 'bye' }).eq('id', matchId)
  }

  return { bracketId, error: null }
}

// ── savePlayoffConfig ─────────────────────────────────────────────────────────

export interface TierInput {
  id?: string   // present when updating an existing tier
  name: string
  seedFrom: number
  seedTo: number
  bracketType: 'single_elimination' | 'double_elimination'
  thirdPlaceGame: boolean
}

export async function savePlayoffConfig(input: {
  leagueId: string
  seedingMethod: 'standings' | 'manual'
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
      .update({ seeding_method: input.seedingMethod })
      .eq('id', configId)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error: createErr } = await (db as any).from('playoff_configs').insert({
      organization_id: org.id,
      league_id: input.leagueId,
      seeding_method: input.seedingMethod,
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
    .select('id, seeding_method')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!config) return { error: 'No playoff config found. Save the config first.', generated: 0, skipped: 0 }

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

  // Compute overall seeded standings
  const rawStandings = await computeStandings(db, leagueId, org.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: divisions } = await (db as any).from('divisions').select('id, name').eq('league_id', leagueId).eq('organization_id', org.id)

  let seededTeams: TeamStanding[]
  if (divisions && divisions.length >= 2) {
    seededTeams = seedFromDivisionStandings(
      divisions.map((div: { id: string; name: string }) => ({
        divisionId: div.id,
        divisionName: div.name,
        teams: rawStandings.filter((t) => t.divisionId === div.id),
      })),
      rawStandings.length
    )
  } else {
    seededTeams = seedFromStandings(rawStandings, rawStandings.length)
  }

  // Apply manual seed overrides
  if (seedOverrides && Object.keys(seedOverrides).length > 0) {
    const overrideMap = new Map(Object.entries(seedOverrides).map(([s, id]) => [Number(s), id]))
    const result: TeamStanding[] = []
    const used = new Set<string>()
    for (let i = 1; i <= seededTeams.length; i++) {
      const override = overrideMap.get(i)
      if (override) {
        const team = seededTeams.find((t) => t.teamId === override)
        if (team) { result.push({ ...team, seed: i }); used.add(override); continue }
      }
      const next = seededTeams.find((t) => !used.has(t.teamId))
      if (next) { result.push({ ...next, seed: i }); used.add(next.teamId) }
    }
    seededTeams = result
  }

  let generated = 0
  let skipped = 0

  for (const tier of tiers) {
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

    // Slice the seeded teams for this tier's seed range
    const tierTeams = seededTeams.slice(tier.seed_from - 1, tier.seed_to)
    if (tierTeams.length < 2) {
      // Not enough teams yet — scaffold with placeholders
      skipped++
      continue
    }

    const { bracketId, error } = await insertBracketWithMatches(db, org.id, leagueId, {
      name: tier.name,
      bracketType: tier.bracket_type as 'single_elimination' | 'double_elimination',
      teamsAdvancing: tierTeams.length,
      thirdPlaceGame: tier.third_place_game,
      seededTeams: tierTeams,
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
