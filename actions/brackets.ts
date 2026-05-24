'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import {
  generateSingleEliminationSpec,
  generateDoubleEliminationSpec,
  generate6TeamBracketSpec,
  generate14TeamAllPlaySpec,
  seedFromStandings,
  seedFromDivisionStandings,
  seedFromPoolStandings,
  type TeamStanding,
  type BracketMatchSpec,
} from '@/lib/bracket'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrgAndRequireAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  return org
}

// Compute standings for a league from confirmed game results.
// gameFilter:
//   'regular_only' = only games with pool_id IS NULL (matches public "Overall Standings" tab)
//   'pool_only'    = only games with pool_id IS NOT NULL
//   'all'          = all games regardless of pool_id
// Returns standings + the league's standings_pts_method so seeding can use the same tiebreakers.
async function computeStandings(
  db: ReturnType<typeof createServiceRoleClient>,
  leagueId: string,
  orgId: string,
  gameFilter: 'all' | 'pool_only' | 'regular_only' = 'regular_only'
): Promise<{ standings: TeamStanding[]; ptsMethod: import('@/lib/bracket').StandingsSortMethod; sport: string | null }> {
  const [{ data: teams }, { data: results }, { data: leagueRow }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('teams').select('id, name, division_id, pool_id').eq('league_id', leagueId).eq('organization_id', orgId).eq('status', 'active'),
    db.from('game_results')
      .select('home_score, away_score, sets, status, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status, pool_id)')
      .eq('organization_id', orgId)
      .eq('status', 'confirmed'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('sport, standings_pts_method').eq('id', leagueId).maybeSingle(),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ptsMethod: import('@/lib/bracket').StandingsSortMethod = (leagueRow as any)?.standings_pts_method ?? 'wins'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sport: string | null = (leagueRow as any)?.sport ?? null
  const isVolleyball = sport === 'volleyball' || sport === 'beach_volleyball'

  const record: Record<string, TeamStanding> = {}
  for (const t of teams ?? []) {
    record[t.id] = {
      teamId: t.id,
      teamName: t.name,
      divisionId: t.division_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      poolId: (t as any).pool_id ?? null,
      wins: 0, losses: 0, ties: 0,
      pointsFor: 0, pointsAgainst: 0,
      setWins: 0, setLosses: 0,
    }
  }

  for (const r of results ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = Array.isArray(r.game) ? r.game[0] : r.game as any
    if (!game || game.status !== 'completed' || game.league_id !== leagueId) continue
    if (gameFilter === 'pool_only' && !game.pool_id) continue
    if (gameFilter === 'regular_only' && game.pool_id) continue
    const ht = game.home_team_id as string
    const at = game.away_team_id as string
    if (!record[ht] || !record[at]) continue
    const hs = r.home_score ?? 0
    const as_ = r.away_score ?? 0
    if (hs > as_) { record[ht].wins++; record[at].losses++ }
    else if (as_ > hs) { record[at].wins++; record[ht].losses++ }
    else { record[ht].ties++; record[at].ties++ }
    // For volleyball: accumulate set-level points; for other sports: match scores
    if (isVolleyball && Array.isArray(r.sets)) {
      for (const s of r.sets as { home: number; away: number }[]) {
        record[ht].pointsFor += s.home; record[ht].pointsAgainst += s.away
        record[at].pointsFor += s.away; record[at].pointsAgainst += s.home
        if (s.home > s.away) { record[ht].setWins!++; record[at].setLosses!++ }
        else if (s.away > s.home) { record[at].setWins!++; record[ht].setLosses!++ }
      }
    } else {
      record[ht].pointsFor += hs; record[ht].pointsAgainst += as_
      record[at].pointsFor += as_; record[at].pointsAgainst += hs
    }
  }

  return { standings: Object.values(record), ptsMethod, sport }
}

// ── createBracket ─────────────────────────────────────────────────────────────

const createBracketSchema = z.object({
  leagueId: z.string().uuid(),
  divisionId: z.string().uuid().optional(),
  name: z.string().min(1).default('Playoffs'),
  bracketType: z.enum(['single_elimination', 'double_elimination', 'all_play']).default('single_elimination'),
  seedingMethod: z.enum(['standings', 'pool_results', 'pool_results_flat', 'manual']).default('standings'),
  bracketSize: z.coerce.number().int().min(2),
  teamsAdvancing: z.coerce.number().int().min(2),
  thirdPlaceGame: z.boolean().default(false),
})

export async function createBracket(input: z.infer<typeof createBracketSchema>) {
  const parsed = createBracketSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input', bracketId: null }

  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()
  const d = parsed.data

  // Only one bracket per division (or per league if no division)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (db as any)
    .from('brackets')
    .select('id')
    .eq('league_id', d.leagueId)
    .eq('organization_id', org.id)
    .eq(d.divisionId ? 'division_id' : 'division_id', d.divisionId ?? null)
    .maybeSingle()

  if (existing) return { error: 'A bracket already exists for this scope. Delete it first.', bracketId: null }

  // Double elimination doesn't need a third-place game — the LB Final loser is naturally 3rd
  const thirdPlaceGame = d.bracketType === 'double_elimination' ? false : d.thirdPlaceGame

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bracket, error } = await (db as any).from('brackets').insert({
    organization_id: org.id,
    league_id: d.leagueId,
    division_id: d.divisionId ?? null,
    name: d.name,
    bracket_type: d.bracketType,
    seeding_method: d.seedingMethod,
    bracket_size: d.bracketSize,
    teams_advancing: d.teamsAdvancing,
    third_place_game: thirdPlaceGame,
    status: 'setup',
  }).select('id').single()

  if (error) return { error: error.message, bracketId: null }

  revalidatePath(`/admin/events/${d.leagueId}/bracket`)
  return { error: null, bracketId: bracket.id as string }
}

// ── scaffoldBracket ───────────────────────────────────────────────────────────
// Creates placeholder bracket_matches (null team IDs + seed labels) so admins
// can assign dates before any teams have registered.
// Safe to call multiple times — deletes and rebuilds the match rows each time.

export async function scaffoldBracket(bracketId: string, leagueId: string) {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bracket } = await (db as any)
    .from('brackets')
    .select('*')
    .eq('id', bracketId)
    .eq('organization_id', org.id)
    .single()

  if (!bracket) return { error: 'Bracket not found' }

  // Read this bracket's tier offset so labels and seed numbers use global ranks
  // (e.g. Tier 2 with seed_from=9 → "Seed 9" not "Seed 1", stored seed 9 not 1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tierRow } = await (db as any)
    .from('playoff_tiers')
    .select('seed_from')
    .eq('bracket_id', bracketId)
    .maybeSingle()
  const scaffoldSeedOffset = tierRow?.seed_from ? Math.max(0, (tierRow.seed_from as number) - 1) : 0

  // Preserve any schedule dates the admin may have already set
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (db as any)
    .from('bracket_matches')
    .select('round_number, match_number, scheduled_at, court, notes')
    .eq('bracket_id', bracketId)
  const scheduleMap = new Map<string, { scheduled_at: string | null; court: string | null; notes: string | null }>()
  for (const m of existing ?? []) {
    scheduleMap.set(`${m.round_number}:${m.match_number}`, { scheduled_at: m.scheduled_at, court: m.court, notes: m.notes })
  }

  const spec = bracket.bracket_type === 'all_play'
    ? (bracket.teams_advancing === 14 ? generate14TeamAllPlaySpec() : generate6TeamBracketSpec())
    : bracket.bracket_type === 'double_elimination'
      ? generateDoubleEliminationSpec(bracket.teams_advancing)
      : bracket.teams_advancing === 6
        ? generate6TeamBracketSpec()
        : generateSingleEliminationSpec(bracket.teams_advancing, bracket.third_place_game)

  const allMatchSpecs = [
    ...spec.matches,
    ...(spec.thirdPlaceMatch ? [spec.thirdPlaceMatch] : []),
  ]

  // Delete existing matches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches').delete().eq('bracket_id', bracketId)

  // Insert placeholder matches with seed labels
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedMatches, error: insertError } = await (db as any)
    .from('bracket_matches')
    .insert(allMatchSpecs.map((m: BracketMatchSpec) => {
      const prev = scheduleMap.get(`${m.roundNumber}:${m.matchNumber}`)
      return {
        organization_id: org.id,
        bracket_id: bracketId,
        round_number: m.roundNumber,
        match_number: m.matchNumber,
        team1_id: null,
        team2_id: null,
        team1_label: (() => {
          if (spec.bestLoserSlot?.roundNumber === m.roundNumber && spec.bestLoserSlot?.matchNumber === m.matchNumber && spec.bestLoserSlot?.slot === 1) return 'Best Loser'
          return m.team1Seed ? `Seed ${m.team1Seed + scaffoldSeedOffset}` : null
        })(),
        team2_label: (() => {
          if (m.isBye) return 'Bye'
          if (spec.bestLoserSlot?.roundNumber === m.roundNumber && spec.bestLoserSlot?.matchNumber === m.matchNumber && spec.bestLoserSlot?.slot === 2) return 'Best Loser'
          return m.team2Seed ? `Seed ${m.team2Seed + scaffoldSeedOffset}` : null
        })(),
        team1_seed: m.team1Seed ? m.team1Seed + scaffoldSeedOffset : null,
        team2_seed: m.isBye ? null : (m.team2Seed ? m.team2Seed + scaffoldSeedOffset : null),
        is_bye: m.isBye,
        status: 'pending',
        // Restore schedule data if previously set
        scheduled_at: prev?.scheduled_at ?? null,
        court: prev?.court ?? null,
        notes: prev?.notes ?? null,
      }
    }))
    .select('id, round_number, match_number')

  if (insertError) return { error: insertError.message }

  // Build lookup: (roundNumber, matchNumber) → id
  const matchIdLookup = new Map<string, string>()
  for (const m of (insertedMatches ?? [])) {
    matchIdLookup.set(`${m.round_number}:${m.match_number}`, m.id)
  }

  await wireMatchReferences(db, allMatchSpecs, matchIdLookup)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('brackets').update({ status: 'scaffold' }).eq('id', bracketId)

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  return { error: null, matchCount: allMatchSpecs.length }
}

// ── seedBracket ───────────────────────────────────────────────────────────────
// Generates all bracket_matches from current standings and stores them.
// Idempotent: deletes existing matches first.
// Preserves any scheduled_at / court / notes set on scaffold matches.

export async function seedBracket(bracketId: string, leagueId: string, seedOverrides?: Record<number, string>) {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bracket } = await (db as any)
    .from('brackets')
    .select('*')
    .eq('id', bracketId)
    .eq('organization_id', org.id)
    .single()

  if (!bracket) return { error: 'Bracket not found' }

  // Look up this bracket's tier (if any) to determine the seed offset.
  // e.g. Tier1 seed_from=1, Tier2 seed_from=9 → Tier2 skips the first 8 teams.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tierRow } = await (db as any)
    .from('playoff_tiers')
    .select('seed_from, seed_to')
    .eq('bracket_id', bracketId)
    .maybeSingle()
  // seed_from is 1-based; convert to 0-based skip count (0 = no skip = top of standings)
  const seedOffset = tierRow?.seed_from ? Math.max(0, (tierRow.seed_from as number) - 1) : 0

  // Compute standings based on seeding method
  let seededTeams: TeamStanding[] = []

  if (bracket.seeding_method === 'standings') {
    // 'regular_only' matches the public Overall Standings tab: only games where pool_id IS NULL.
    // Pool-play games are excluded so seeding order matches what admins see in standings.
    const { standings, ptsMethod } = await computeStandings(db, leagueId, org.id, 'regular_only')

    // Sort the full standings once so all tier slicing operates on the correct order.
    // seedFromStandings sorts internally, but slicing an unsorted array first would
    // pick the wrong teams. By pre-sorting we ensure slice(seedOffset, ...) always
    // skips exactly the right number of top-ranked teams.
    const sortedStandings = seedFromStandings(standings, standings.length, ptsMethod)

    if (bracket.division_id) {
      const divTeams = sortedStandings.filter((t) => t.divisionId === bracket.division_id)
      // Slice from the offset and re-number seeds 1-N within this tier
      const sliced = divTeams.slice(seedOffset, seedOffset + bracket.teams_advancing)
      seededTeams = sliced.map((t, i) => ({ ...t, seed: i + 1 }))
    } else {
      const { data: divisions } = await db.from('divisions').select('id, name').eq('league_id', leagueId).eq('organization_id', org.id)

      if (divisions && divisions.length > 0) {
        if (seedOffset === 0) {
          // Top tier with divisions: use snake/wild-card seeding across divisions
          const divisionStandings = divisions.map((div) => ({
            divisionId: div.id,
            divisionName: div.name,
            teams: standings.filter((t) => t.divisionId === div.id),
          }))
          seededTeams = seedFromDivisionStandings(divisionStandings, bracket.teams_advancing)
        } else {
          // Lower tier: skip teams already in higher tiers, then take the next block
          const sliced = sortedStandings.slice(seedOffset, seedOffset + bracket.teams_advancing)
          seededTeams = sliced.map((t, i) => ({ ...t, seed: i + 1 }))
        }
      } else {
        // No divisions — skip the top seedOffset teams and take the next block
        const sliced = sortedStandings.slice(seedOffset, seedOffset + bracket.teams_advancing)
        seededTeams = sliced.map((t, i) => ({ ...t, seed: i + 1 }))
      }
    }
  } else if (
    bracket.seeding_method === 'pool_results' ||
    bracket.seeding_method === 'pool_results_alternating' ||
    bracket.seeding_method === 'pool_tiers'
  ) {
    // Use pool-play game results for standings (not regular season games)
    const { standings, ptsMethod } = await computeStandings(db, leagueId, org.id, 'pool_only')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pools } = await (db as any)
      .from('pools')
      .select('id, name, sort_order')
      .eq('league_id', leagueId)
      .eq('organization_id', org.id)
      .order('sort_order', { ascending: true })

    if (pools && pools.length > 0) {
      if (bracket.seeding_method === 'pool_tiers') {
        // Each tier maps to one pool by index.
        // Look up which index this bracket's tier has among all tiers for this league.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: tierRow } = await (db as any)
          .from('playoff_tiers')
          .select('config_id')
          .eq('bracket_id', bracketId)
          .maybeSingle()

        let tierIndex = 0
        if (tierRow?.config_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: allTiers } = await (db as any)
            .from('playoff_tiers')
            .select('id, bracket_id')
            .eq('config_id', tierRow.config_id)
            .order('sort_order', { ascending: true })
          tierIndex = (allTiers ?? []).findIndex((t: { bracket_id: string | null }) => t.bracket_id === bracketId)
          if (tierIndex < 0) tierIndex = 0
        }

        const pool = pools[tierIndex]
        if (pool) {
          seededTeams = seedFromStandings(
            standings.filter((t) => t.poolId === pool.id),
            bracket.teams_advancing,
            ptsMethod
          )
        }
      } else {
        // Shared: fetch advance_per_pool from the config if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: tierRow } = await (db as any)
          .from('playoff_tiers')
          .select('config_id')
          .eq('bracket_id', bracketId)
          .maybeSingle()
        let advancePerPool: number[] | undefined
        if (tierRow?.config_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: cfgRow } = await (db as any)
            .from('playoff_configs')
            .select('advance_per_pool')
            .eq('id', tierRow.config_id)
            .maybeSingle()
          advancePerPool = cfgRow?.advance_per_pool ?? undefined
        }

        const poolStandings = pools.map((pool: { id: string; name: string }) => ({
          poolId: pool.id,
          poolName: pool.name,
          teams: standings.filter((t) => t.poolId === pool.id),
        }))
        const order = bracket.seeding_method === 'pool_results_alternating' ? 'alternating' : 'block'
        seededTeams = seedFromPoolStandings(poolStandings, bracket.teams_advancing, order, advancePerPool)
      }
    }
  } else if (bracket.seeding_method === 'pool_results_flat') {
    // Cross-pool flat ranking: count only pool-play games, rank all teams together,
    // then apply the tier offset so Tier2 (seed_from=9) picks teams 9–14.
    const { standings: poolOnlyStandings, ptsMethod } = await computeStandings(db, leagueId, org.id, 'pool_only')
    const hasPoolData = poolOnlyStandings.some((t) => t.wins > 0 || t.losses > 0 || t.ties > 0)
    // If no pool-play game data exists (no pool_id set on games, or no confirmed results),
    // fall back to full-season standings so seeding is at least deterministic.
    const { standings } = hasPoolData
      ? { standings: poolOnlyStandings }
      : await computeStandings(db, leagueId, org.id, 'regular_only')
    const sortedStandings = seedFromStandings(standings, standings.length, ptsMethod)
    const sliced = sortedStandings.slice(seedOffset, seedOffset + bracket.teams_advancing)
    seededTeams = sliced.map((t, i) => ({ ...t, seed: i + 1 }))
    if (!hasPoolData) {
      console.warn('[seedBracket] pool_results_flat: no pool-play game data found; falling back to full-season standings. Ensure pool games have pool_id set and results are confirmed.')
    }
  }

  // Apply seed overrides
  if (seedOverrides && Object.keys(seedOverrides).length > 0) {
    const overrideMap = new Map(Object.entries(seedOverrides).map(([seed, teamId]) => [Number(seed), teamId]))
    const finalSeeds: (TeamStanding | undefined)[] = new Array(seededTeams.length)
    const usedIds = new Set<string>()
    for (const [seed, teamId] of overrideMap) {
      const team = seededTeams.find((t) => t.teamId === teamId)
      if (team && seed >= 1 && seed <= seededTeams.length) {
        finalSeeds[seed - 1] = { ...team, seed }
        usedIds.add(teamId)
      }
    }
    let freeSlot = 0
    for (const team of seededTeams) {
      if (!usedIds.has(team.teamId)) {
        while (finalSeeds[freeSlot] !== undefined) freeSlot++
        finalSeeds[freeSlot] = { ...team, seed: freeSlot + 1 }
        usedIds.add(team.teamId)
      }
    }
    seededTeams = (finalSeeds.filter(Boolean) as TeamStanding[]).map((t, i) => ({ ...t, seed: i + 1 }))
  }

  // Generate the bracket structure — must match the spec used during scaffold.
  // For 6-team brackets (both all_play and legacy single_elimination), use generate6TeamBracketSpec()
  // so the seeded match layout is identical to what the scaffold created.
  const spec = bracket.bracket_type === 'all_play'
    ? (bracket.teams_advancing === 14 ? generate14TeamAllPlaySpec() : generate6TeamBracketSpec())
    : bracket.bracket_type === 'double_elimination'
      ? generateDoubleEliminationSpec(bracket.teams_advancing)
      : bracket.teams_advancing === 6
        ? generate6TeamBracketSpec()
        : generateSingleEliminationSpec(bracket.teams_advancing, bracket.third_place_game)

  const seedMap = new Map(seededTeams.map((t) => [t.seed!, t.teamId]))

  // Preserve any schedule dates from scaffold matches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingMatches } = await (db as any)
    .from('bracket_matches')
    .select('round_number, match_number, scheduled_at, court, notes')
    .eq('bracket_id', bracketId)
  const scheduleMap = new Map<string, { scheduled_at: string | null; court: string | null; notes: string | null }>()
  for (const m of existingMatches ?? []) {
    scheduleMap.set(`${m.round_number}:${m.match_number}`, { scheduled_at: m.scheduled_at, court: m.court, notes: m.notes })
  }

  // Delete existing matches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches').delete().eq('bracket_id', bracketId)

  const allMatchSpecs = [
    ...spec.matches,
    ...(spec.thirdPlaceMatch ? [spec.thirdPlaceMatch] : []),
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedMatches, error: insertError } = await (db as any)
    .from('bracket_matches')
    .insert(allMatchSpecs.map((m: BracketMatchSpec) => {
      const prev = scheduleMap.get(`${m.roundNumber}:${m.matchNumber}`)
      // Only WB R1 matches get seeded teams; all other matches start empty
      const isWbFirstRound = m.team1Seed !== null || m.team2Seed !== null
      return {
        organization_id: org.id,
        bracket_id: bracketId,
        round_number: m.roundNumber,
        match_number: m.matchNumber,
        team1_id: m.team1Seed ? (seedMap.get(m.team1Seed) ?? null) : null,
        team2_id: m.isBye ? null : (m.team2Seed ? (seedMap.get(m.team2Seed) ?? null) : null),
        // Preserve "Best Loser" label on the wild card slot — it stays empty until advanceBestLoser() runs
        team1_label: (spec.bestLoserSlot?.roundNumber === m.roundNumber && spec.bestLoserSlot?.matchNumber === m.matchNumber && spec.bestLoserSlot?.slot === 1) ? 'Best Loser' : null,
        team2_label: (spec.bestLoserSlot?.roundNumber === m.roundNumber && spec.bestLoserSlot?.matchNumber === m.matchNumber && spec.bestLoserSlot?.slot === 2) ? 'Best Loser' : null,
        // Store global seed so the bracket view shows the overall rank (e.g. 9 not 1 for Tier 2)
        team1_seed: m.team1Seed ? m.team1Seed + seedOffset : null,
        team2_seed: m.isBye ? null : (m.team2Seed ? m.team2Seed + seedOffset : null),
        is_bye: m.isBye,
        status: m.isBye ? 'bye' : (isWbFirstRound && m.team1Seed && (m.team2Seed || m.isBye) ? 'ready' : 'pending'),
        scheduled_at: prev?.scheduled_at ?? null,
        court: prev?.court ?? null,
        notes: prev?.notes ?? null,
      }
    }))
    .select('id, round_number, match_number')

  if (insertError) return { error: insertError.message }

  // Build lookup
  const matchIdLookup = new Map<string, string>()
  for (const m of (insertedMatches ?? [])) {
    matchIdLookup.set(`${m.round_number}:${m.match_number}`, m.id)
  }

  await wireMatchReferences(db, allMatchSpecs, matchIdLookup)

  // Auto-advance byes
  for (const m of allMatchSpecs.filter((m: BracketMatchSpec) => m.isBye)) {
    const matchId = matchIdLookup.get(`${m.roundNumber}:${m.matchNumber}`)
    if (!matchId || !m.team1Seed) continue
    const winnerId = seedMap.get(m.team1Seed)
    if (!winnerId) continue
    await advanceWinner(db, org.id, bracketId, matchId, winnerId)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('brackets').update({ status: 'seeding' }).eq('id', bracketId)

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  revalidatePath('/events/[slug]', 'page')
  return {
    error: null,
    // Diagnostic: ordered list of seeded teams so the admin can compare against standings
    seededOrder: seededTeams.map((t) => ({ seed: t.seed ?? 0, name: t.teamName, wins: t.wins, losses: t.losses, ties: t.ties })),
  }
}

// ── wireMatchReferences (shared by scaffold + seed) ───────────────────────────
// Sets winner_to_match_id and loser_to_match_id on all matches after insertion.

async function wireMatchReferences(
  db: ReturnType<typeof createServiceRoleClient>,
  allMatchSpecs: BracketMatchSpec[],
  matchIdLookup: Map<string, string>
) {
  // Winner references
  const winnerUpdates = allMatchSpecs
    .filter((m) => m.winnerToRoundNumber !== null && m.winnerToMatchNumber !== null)
    .map((m) => {
      const toId = matchIdLookup.get(`${m.winnerToRoundNumber}:${m.winnerToMatchNumber}`)
      const thisId = matchIdLookup.get(`${m.roundNumber}:${m.matchNumber}`)
      if (!toId || !thisId) return null
      return { id: thisId, winner_to_match_id: toId, winner_to_slot: m.winnerToSlot }
    })
    .filter(Boolean)

  for (const upd of winnerUpdates) {
    if (!upd) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('bracket_matches')
      .update({ winner_to_match_id: upd.winner_to_match_id, winner_to_slot: upd.winner_to_slot })
      .eq('id', upd.id)
  }

  // Loser references (double elimination)
  const loserUpdates = allMatchSpecs
    .filter((m) => m.loserToRoundNumber !== null && m.loserToMatchNumber !== null)
    .map((m) => {
      const toId = matchIdLookup.get(`${m.loserToRoundNumber}:${m.loserToMatchNumber}`)
      const thisId = matchIdLookup.get(`${m.roundNumber}:${m.matchNumber}`)
      if (!toId || !thisId) return null
      return { id: thisId, loser_to_match_id: toId, loser_to_slot: m.loserToSlot }
    })
    .filter(Boolean)

  for (const upd of loserUpdates) {
    if (!upd) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('bracket_matches')
      .update({ loser_to_match_id: upd.loser_to_match_id, loser_to_slot: upd.loser_to_slot })
      .eq('id', upd.id)
  }
}

// ── publishBracket ────────────────────────────────────────────────────────────

export async function publishBracket(bracketId: string, leagueId: string) {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('brackets')
    .update({ status: 'active', published_at: new Date().toISOString() })
    .eq('id', bracketId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

// ── deleteBracket ─────────────────────────────────────────────────────────────

export async function deleteBracket(bracketId: string, leagueId: string) {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches').delete().eq('bracket_id', bracketId).eq('organization_id', org.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('brackets').delete().eq('id', bracketId).eq('organization_id', org.id)

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  return { error: null }
}

// ── advanceWinner (internal + exported for scores hook) ───────────────────────

export async function advanceWinner(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  bracketId: string,
  matchId: string,
  winnerTeamId: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: match } = await (db as any)
    .from('bracket_matches')
    .select('winner_to_match_id, winner_to_slot')
    .eq('id', matchId)
    .single()

  if (!match?.winner_to_match_id) return

  const updateField = match.winner_to_slot === 1 ? 'team1_id' : 'team2_id'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nextMatch } = await (db as any)
    .from('bracket_matches')
    .select('id, team1_id, team2_id')
    .eq('id', match.winner_to_match_id)
    .single()

  if (!nextMatch) return

  const otherTeamField = match.winner_to_slot === 1 ? 'team2_id' : 'team1_id'
  const bothFilled = nextMatch[otherTeamField] !== null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches')
    .update({
      [updateField]: winnerTeamId,
      status: bothFilled ? 'ready' : 'pending',
    })
    .eq('id', match.winner_to_match_id)
}

// ── advanceLoser (double elimination — routes loser to LB) ────────────────────

async function advanceLoser(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  bracketId: string,
  matchId: string,
  loserTeamId: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: match } = await (db as any)
    .from('bracket_matches')
    .select('loser_to_match_id, loser_to_slot')
    .eq('id', matchId)
    .single()

  if (!match?.loser_to_match_id) return // single elim or no routing defined

  const updateField = match.loser_to_slot === 1 ? 'team1_id' : 'team2_id'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nextMatch } = await (db as any)
    .from('bracket_matches')
    .select('id, team1_id, team2_id')
    .eq('id', match.loser_to_match_id)
    .single()

  if (!nextMatch) return

  const otherTeamField = match.loser_to_slot === 1 ? 'team2_id' : 'team1_id'
  const bothFilled = nextMatch[otherTeamField] !== null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches')
    .update({
      [updateField]: loserTeamId,
      status: bothFilled ? 'ready' : 'pending',
    })
    .eq('id', match.loser_to_match_id)
}

// ── recordBracketScore ────────────────────────────────────────────────────────
// Called directly from admin score entry for bracket matches.

const bracketScoreSchema = z.object({
  matchId: z.string().uuid(),
  bracketId: z.string().uuid(),
  leagueId: z.string().uuid(),
  score1: z.coerce.number().int().min(0),
  score2: z.coerce.number().int().min(0),
  sets: z.array(z.object({ s1: z.number().int().min(0), s2: z.number().int().min(0) })).optional(),
})

export async function recordBracketScore(input: z.infer<typeof bracketScoreSchema>) {
  const parsed = bracketScoreSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()
  const d = parsed.data

  if (d.score1 === d.score2) return { error: 'Bracket matches cannot end in a tie' }

  const winnerSlot = d.score1 > d.score2 ? 1 : 2

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: match } = await (db as any)
    .from('bracket_matches')
    .select('team1_id, team2_id')
    .eq('id', d.matchId)
    .eq('bracket_id', d.bracketId)
    .eq('organization_id', org.id)
    .single()

  if (!match) return { error: 'Match not found' }

  const winnerTeamId = winnerSlot === 1 ? match.team1_id : match.team2_id
  const loserTeamId = winnerSlot === 1 ? match.team2_id : match.team1_id
  if (!winnerTeamId) return { error: 'Teams not yet determined for this match' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (db as any).from('bracket_matches')
    .update({
      score1: d.score1,
      score2: d.score2,
      sets: d.sets ?? null,
      winner_team_id: winnerTeamId,
      status: 'completed',
    })
    .eq('id', d.matchId)

  if (updateError) return { error: updateError.message }

  await advanceWinner(db, org.id, d.bracketId, d.matchId, winnerTeamId)
  if (loserTeamId) {
    await advanceLoser(db, org.id, d.bracketId, d.matchId, loserTeamId)
  }

  revalidatePath(`/admin/events/${d.leagueId}/bracket`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

// ── updateMatchSchedule ───────────────────────────────────────────────────────

export async function updateMatchSchedule(input: {
  matchId: string; leagueId: string; scheduledAt?: string; court?: string; notes?: string
}) {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('bracket_matches')
    .update({
      scheduled_at: input.scheduledAt || null,
      court: input.court || null,
      notes: input.notes || null,
    })
    .eq('id', input.matchId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${input.leagueId}/bracket`)
  return { error: null }
}

// ── overrideBracketSlot ───────────────────────────────────────────────────────
// Force-assigns (or clears) a team in a specific slot of a bracket match.
// Blocked if the match already has a score recorded.

export async function overrideBracketSlot(input: {
  matchId: string
  bracketId: string
  leagueId: string
  slot: 1 | 2
  teamId: string | null
}) {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: match } = await (db as any)
    .from('bracket_matches')
    .select('id, status, team1_id, team2_id')
    .eq('id', input.matchId)
    .eq('bracket_id', input.bracketId)
    .eq('organization_id', org.id)
    .single()

  if (!match) return { error: 'Match not found' }
  if (match.status === 'completed') return { error: 'Cannot change teams in a completed match' }

  const updateField = input.slot === 1 ? 'team1_id' : 'team2_id'
  const otherField = input.slot === 1 ? 'team2_id' : 'team1_id'
  const otherTeamId = match[otherField]

  const newStatus = input.teamId && otherTeamId ? 'ready' : 'pending'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('bracket_matches')
    .update({ [updateField]: input.teamId, status: newStatus })
    .eq('id', input.matchId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${input.leagueId}/bracket`)
  return { error: null }
}

// ── swapBracketTeams ──────────────────────────────────────────────────────────
// Swaps two team slots (potentially across different matches) within a bracket.
// Blocked if either match has a score recorded.

export async function swapBracketTeams(input: {
  bracketId: string
  leagueId: string
  slotA: { matchId: string; slot: 1 | 2 }
  slotB: { matchId: string; slot: 1 | 2 }
}) {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  const matchIds = [input.slotA.matchId, input.slotB.matchId]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matches } = await (db as any)
    .from('bracket_matches')
    .select('id, status, team1_id, team2_id, team1_seed, team2_seed')
    .in('id', matchIds)
    .eq('bracket_id', input.bracketId)
    .eq('organization_id', org.id)

  if (!matches || matches.length !== 2) return { error: 'Matches not found' }

  type MatchRow = { id: string; status: string; team1_id: string | null; team2_id: string | null; team1_seed: number | null; team2_seed: number | null }
  const typedMatches = matches as MatchRow[]

  if (typedMatches.some((m) => m.status === 'completed')) {
    return { error: 'Cannot swap teams — one or both matches already have scores recorded' }
  }

  const matchMap = new Map(typedMatches.map((m) => [m.id, m]))
  const matchA = matchMap.get(input.slotA.matchId)
  const matchB = matchMap.get(input.slotB.matchId)
  if (!matchA || !matchB) return { error: 'Matches not found' }

  const teamA = input.slotA.slot === 1 ? matchA.team1_id : matchA.team2_id
  const teamB = input.slotB.slot === 1 ? matchB.team1_id : matchB.team2_id
  const seedA = input.slotA.slot === 1 ? matchA.team1_seed : matchA.team2_seed
  const seedB = input.slotB.slot === 1 ? matchB.team1_seed : matchB.team2_seed

  const fieldA = input.slotA.slot === 1 ? 'team1_id' : 'team2_id'
  const fieldB = input.slotB.slot === 1 ? 'team1_id' : 'team2_id'
  const seedFieldA = input.slotA.slot === 1 ? 'team1_seed' : 'team2_seed'
  const seedFieldB = input.slotB.slot === 1 ? 'team1_seed' : 'team2_seed'

  const otherA = input.slotA.slot === 1 ? matchA.team2_id : matchA.team1_id
  const otherB = input.slotB.slot === 1 ? matchB.team2_id : matchB.team1_id
  const statusA = teamB && otherA ? 'ready' : 'pending'
  const statusB = teamA && otherB ? 'ready' : 'pending'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches')
    .update({ [fieldA]: teamB, [seedFieldA]: seedB, status: statusA })
    .eq('id', input.slotA.matchId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches')
    .update({ [fieldB]: teamA, [seedFieldB]: seedA, status: statusB })
    .eq('id', input.slotB.matchId)

  revalidatePath(`/admin/events/${input.leagueId}/bracket`)
  return { error: null }
}

// ── reverseBracketAdvancement (called by adminClearScore) ────────────────────
// Undoes what advanceBracketFromScore did: clears winner/loser from downstream
// matches and resets the current match back to 'ready'.
// Returns an error string if a downstream match has already been played.

export async function reverseBracketAdvancement(gameId: string, orgId: string): Promise<{ error: string | null }> {
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: match } = await (db as any)
    .from('bracket_matches')
    .select('id, winner_to_match_id, winner_to_slot, loser_to_match_id, loser_to_slot, brackets!bracket_matches_bracket_id_fkey(league_id)')
    .eq('game_id', gameId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!match) return { error: null } // not a bracket game

  // Block if any downstream match is already completed
  const downstreamIds = [match.winner_to_match_id, match.loser_to_match_id].filter(Boolean)
  if (downstreamIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: downstream } = await (db as any)
      .from('bracket_matches')
      .select('status')
      .in('id', downstreamIds)

    const hasCompleted = (downstream ?? []).some((m: { status: string }) => m.status === 'completed')
    if (hasCompleted) {
      return { error: 'A later bracket match has already been played. Clear that match first.' }
    }
  }

  // Clear winner slot in next match
  if (match.winner_to_match_id) {
    const field = match.winner_to_slot === 1 ? 'team1_id' : 'team2_id'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('bracket_matches')
      .update({ [field]: null, status: 'pending', winner_team_id: null })
      .eq('id', match.winner_to_match_id)
  }

  // Clear loser slot in loser-bracket match (double elimination)
  if (match.loser_to_match_id) {
    const field = match.loser_to_slot === 1 ? 'team1_id' : 'team2_id'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('bracket_matches')
      .update({ [field]: null, status: 'pending' })
      .eq('id', match.loser_to_match_id)
  }

  // Reset this match back to ready (teams still present, score/winner cleared)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches')
    .update({ score1: null, score2: null, winner_team_id: null, status: 'ready' })
    .eq('id', match.id)

  const league = Array.isArray(match.brackets) ? match.brackets[0] : match.brackets
  const leagueId = (league as { league_id: string } | null)?.league_id
  if (leagueId) {
    revalidatePath(`/admin/events/${leagueId}/bracket`)
    revalidatePath('/events/[slug]', 'page')
  }

  return { error: null }
}

// ── clearBracketSeeding ───────────────────────────────────────────────────────
// Nulls all team slots across every match in a bracket and resets all matches
// to 'pending'. Court/time/notes are preserved. Blocked if any match has a
// score (admin must clear scores first).

export async function clearBracketSeeding(bracketId: string, leagueId: string) {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matches } = await (db as any)
    .from('bracket_matches')
    .select('id, status, is_bye')
    .eq('bracket_id', bracketId)
    .eq('organization_id', org.id)

  if (!matches) return { error: 'Bracket not found' }

  const hasScores = (matches as { status: string }[]).some((m) => m.status === 'completed')
  if (hasScores) return { error: 'Cannot clear seeding while matches have scores recorded. Clear all scores first.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('bracket_matches')
    .update({
      team1_id: null,
      team2_id: null,
      team1_seed: null,
      team2_seed: null,
      team1_label: null,
      team2_label: null,
      winner_team_id: null,
      score1: null,
      score2: null,
      status: 'pending',
    })
    .eq('bracket_id', bracketId)
    .eq('organization_id', org.id)
    .eq('is_bye', false)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  return { error: null }
}

// ── advanceBestLoser ─────────────────────────────────────────────────────────
// Used in all-play brackets after all first-round matches are complete.
// Ranks the losers by: bracket match score margin → set wins → point differential →
// total points scored → pool/regular-season wins → head-to-head wins.
// Places the top-ranked loser into the designated best-loser slot per the bracket spec.

export type BestLoserCandidate = {
  teamId: string
  teamName: string
  // Bracket first-round stats — primary tiebreaker
  qfSetWins: number
  qfPointDiff: number
  qfPointsFor: number
  // League / pool-play stats — secondary tiebreaker
  wins: number
  setWins: number
  pointDiff: number
  pointsFor: number
  h2hWins: number
}

export async function advanceBestLoser(bracketId: string, leagueId: string): Promise<{
  error: string | null
  advanced?: { teamId: string; teamName: string }
  candidates?: BestLoserCandidate[]
}> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  // Load bracket + all matches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bracket } = await (db as any)
    .from('brackets')
    .select('id, teams_advancing, bracket_type')
    .eq('id', bracketId)
    .eq('organization_id', org.id)
    .single()

  if (!bracket) return { error: 'Bracket not found' }

  // Support all_play brackets (6 or 14 teams) and legacy 6-team single_elimination
  const isAllPlay = bracket.bracket_type === 'all_play'
  const isLegacy6 = bracket.teams_advancing === 6 && bracket.bracket_type === 'single_elimination'
  if (!isAllPlay && !isLegacy6) {
    return { error: 'Best loser advancement only applies to all-play brackets' }
  }
  if (isAllPlay && bracket.teams_advancing !== 6 && bracket.teams_advancing !== 14) {
    return { error: 'All-play best loser is only supported for 6 or 14 team brackets' }
  }

  // Get the spec to find the best loser target slot
  const spec = bracket.teams_advancing === 14 ? generate14TeamAllPlaySpec() : generate6TeamBracketSpec()
  const { bestLoserSlot } = spec
  if (!bestLoserSlot) return { error: 'Bracket spec has no best loser slot defined' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allMatches } = await (db as any)
    .from('bracket_matches')
    .select('id, round_number, match_number, team1_id, team2_id, winner_team_id, status, score1, score2, sets')
    .eq('bracket_id', bracketId)
    .eq('organization_id', org.id)

  type SetScore = { s1: number; s2: number }
  type MatchRow = { id: string; round_number: number; match_number: number; team1_id: string | null; team2_id: string | null; winner_team_id: string | null; status: string; score1: number | null; score2: number | null; sets: SetScore[] | null }
  const matches = (allMatches ?? []) as MatchRow[]

  // R1 = the round with the highest round_number (all teams play)
  const maxRound = Math.max(...matches.map((m) => m.round_number))
  const r1Matches = matches.filter((m) => m.round_number === maxRound)
  const expectedR1Count = bracket.teams_advancing === 14 ? 7 : 3

  if (r1Matches.length !== expectedR1Count) return { error: 'First round matches not found' }
  if (r1Matches.some((m) => m.status !== 'completed')) return { error: 'All first-round matches must be completed before determining the best loser' }

  // Find the target match for the best loser using the spec
  const targetMatch = matches.find((m) => m.round_number === bestLoserSlot.roundNumber && m.match_number === bestLoserSlot.matchNumber)
  if (!targetMatch) return { error: 'Best loser target match not found' }
  const alreadyFilled = bestLoserSlot.slot === 1 ? targetMatch.team1_id : targetMatch.team2_id
  if (alreadyFilled) return { error: 'Best loser has already been determined' }

  // Collect the losers from all R1 matches
  const loserIds: string[] = []
  for (const m of r1Matches) {
    if (!m.winner_team_id || !m.team1_id || !m.team2_id) return { error: 'Match result incomplete' }
    const loserId = m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id
    loserIds.push(loserId)
  }

  // Load team names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: teamRows } = await (db as any)
    .from('teams')
    .select('id, name')
    .in('id', loserIds)
    .eq('organization_id', org.id)

  type TeamRow = { id: string; name: string }
  const teamMap = new Map<string, string>(((teamRows ?? []) as TeamRow[]).map((t) => [t.id, t.name]))

  // Fetch all confirmed regular-season and pool-play game results for the league
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: resultRows } = await (db as any)
    .from('game_results')
    .select('home_score, away_score, sets, status, game:games!game_results_game_id_fkey(home_team_id, away_team_id, status)')
    .eq('organization_id', org.id)
    .eq('status', 'confirmed')

  type ResultRow = {
    home_score: number | null
    away_score: number | null
    sets: SetScore[] | null
    status: string
    game: { home_team_id: string; away_team_id: string; status: string } | { home_team_id: string; away_team_id: string; status: string }[] | null
  }
  const results = (resultRows ?? []) as ResultRow[]

  const loserSet = new Set(loserIds)

  // Initialise stats record
  const stats: Record<string, BestLoserCandidate> = {}
  for (const id of loserIds) {
    stats[id] = { teamId: id, teamName: teamMap.get(id) ?? id, qfSetWins: 0, qfPointDiff: 0, qfPointsFor: 0, wins: 0, setWins: 0, pointDiff: 0, pointsFor: 0, h2hWins: 0 }
  }

  // ── Primary: quarterfinal (bracket first-round) stats ───────────────────────
  for (const m of r1Matches) {
    const s1 = m.score1 ?? 0
    const s2 = m.score2 ?? 0
    const loserId = m.winner_team_id === m.team1_id ? m.team2_id! : m.team1_id!
    if (!stats[loserId]) continue
    const isTeam1 = loserId === m.team1_id
    const myScore = isTeam1 ? s1 : s2
    const theirScore = isTeam1 ? s2 : s1
    stats[loserId].qfPointsFor += myScore
    stats[loserId].qfPointDiff += myScore - theirScore
    if (m.sets && Array.isArray(m.sets)) {
      for (const set of m.sets as SetScore[]) {
        stats[loserId].qfSetWins += isTeam1 ? (set.s1 > set.s2 ? 1 : 0) : (set.s2 > set.s1 ? 1 : 0)
      }
    }
  }

  // ── Secondary: league / pool-play game stats ────────────────────────────────
  for (const r of results) {
    const game = Array.isArray(r.game) ? r.game[0] : r.game
    if (!game || game.status !== 'completed') continue
    const ht = game.home_team_id
    const at = game.away_team_id
    const hScore = r.home_score ?? 0
    const aScore = r.away_score ?? 0

    for (const id of [ht, at]) {
      if (!loserSet.has(id)) continue
      const isHome = id === ht
      const myScore = isHome ? hScore : aScore
      const theirScore = isHome ? aScore : hScore
      stats[id].pointsFor += myScore
      stats[id].pointDiff += myScore - theirScore
      if (myScore > theirScore) stats[id].wins++
    }

    if (r.sets && Array.isArray(r.sets)) {
      for (const set of r.sets as SetScore[]) {
        if (loserSet.has(ht)) stats[ht].setWins += set.s1 > set.s2 ? 1 : 0
        if (loserSet.has(at)) stats[at].setWins += set.s2 > set.s1 ? 1 : 0
      }
    }

    // Head-to-head: only games between the 3 losers
    if (loserSet.has(ht) && loserSet.has(at)) {
      if (hScore > aScore) stats[ht].h2hWins++
      else if (aScore > hScore) stats[at].h2hWins++
    }
  }

  // Rank: QF stats first, then league/pool-play stats
  const ranked = Object.values(stats).sort((a, b) => {
    if (b.qfSetWins !== a.qfSetWins) return b.qfSetWins - a.qfSetWins
    if (b.qfPointDiff !== a.qfPointDiff) return b.qfPointDiff - a.qfPointDiff
    if (b.qfPointsFor !== a.qfPointsFor) return b.qfPointsFor - a.qfPointsFor
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.setWins !== a.setWins) return b.setWins - a.setWins
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor
    return b.h2hWins - a.h2hWins
  })

  const best = ranked[0]

  // Place the best loser in the target slot defined by the spec
  const isSlot1 = bestLoserSlot.slot === 1
  const otherSlotFilled = isSlot1 ? !!targetMatch.team2_id : !!targetMatch.team1_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('bracket_matches')
    .update(isSlot1
      ? { team1_id: best.teamId, team1_label: null, status: otherSlotFilled ? 'ready' : 'pending' }
      : { team2_id: best.teamId, team2_label: null, status: otherSlotFilled ? 'ready' : 'pending' }
    )
    .eq('id', targetMatch.id)

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  return { error: null, advanced: { teamId: best.teamId, teamName: best.teamName }, candidates: ranked }
}

// ── advanceBracketFromScore (called by scores.ts after confirm) ───────────────
// Public hook: checks if a confirmed game is linked to a bracket match and auto-advances.

export async function advanceBracketFromScore(
  gameId: string,
  homeScore: number,
  awayScore: number,
  orgId: string
) {
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: match } = await (db as any)
    .from('bracket_matches')
    .select('id, bracket_id, team1_id, team2_id, brackets!bracket_matches_bracket_id_fkey(league_id)')
    .eq('game_id', gameId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!match || match.status === 'completed') return

  if (homeScore === awayScore) return // ties not allowed in playoffs

  const winnerTeamId = homeScore > awayScore ? match.team1_id : match.team2_id
  const loserTeamId = homeScore > awayScore ? match.team2_id : match.team1_id
  if (!winnerTeamId) return

  const league = Array.isArray(match.brackets) ? match.brackets[0] : match.brackets
  const leagueId = (league as { league_id: string } | null)?.league_id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches')
    .update({
      score1: homeScore,
      score2: awayScore,
      winner_team_id: winnerTeamId,
      status: 'completed',
    })
    .eq('id', match.id)

  await advanceWinner(db, orgId, match.bracket_id, match.id, winnerTeamId)
  if (loserTeamId) {
    await advanceLoser(db, orgId, match.bracket_id, match.id, loserTeamId)
  }

  if (leagueId) {
    revalidatePath(`/admin/events/${leagueId}/bracket`)
    revalidatePath('/events/[slug]', 'page')
  }
}
