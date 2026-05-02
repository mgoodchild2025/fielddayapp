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

// Compute standings for a league from confirmed game results
async function computeStandings(
  db: ReturnType<typeof createServiceRoleClient>,
  leagueId: string,
  orgId: string
): Promise<TeamStanding[]> {
  const [{ data: teams }, { data: results }] = await Promise.all([
    db.from('teams').select('id, name, division_id').eq('league_id', leagueId).eq('organization_id', orgId).eq('status', 'active'),
    db.from('game_results')
      .select('home_score, away_score, status, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status, pool_id)')
      .eq('organization_id', orgId)
      .eq('status', 'confirmed'),
  ])

  const record: Record<string, TeamStanding> = {}
  for (const t of teams ?? []) {
    record[t.id] = {
      teamId: t.id,
      teamName: t.name,
      divisionId: t.division_id,
      wins: 0, losses: 0, ties: 0,
      pointsFor: 0, pointsAgainst: 0,
    }
  }

  for (const r of results ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = Array.isArray(r.game) ? r.game[0] : r.game as any
    if (!game || game.status !== 'completed' || game.league_id !== leagueId) continue
    const ht = game.home_team_id as string
    const at = game.away_team_id as string
    if (!record[ht] || !record[at]) continue
    const hs = r.home_score ?? 0
    const as_ = r.away_score ?? 0
    record[ht].pointsFor += hs; record[ht].pointsAgainst += as_
    record[at].pointsFor += as_; record[at].pointsAgainst += hs
    if (hs > as_) { record[ht].wins++; record[at].losses++ }
    else if (as_ > hs) { record[at].wins++; record[ht].losses++ }
    else { record[ht].ties++; record[at].ties++ }
  }

  return Object.values(record)
}

// ── createBracket ─────────────────────────────────────────────────────────────

const createBracketSchema = z.object({
  leagueId: z.string().uuid(),
  divisionId: z.string().uuid().optional(),
  name: z.string().min(1).default('Playoffs'),
  bracketType: z.enum(['single_elimination', 'double_elimination']).default('single_elimination'),
  seedingMethod: z.enum(['standings', 'pool_results', 'manual']).default('standings'),
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

  const spec = bracket.bracket_type === 'double_elimination'
    ? generateDoubleEliminationSpec(bracket.teams_advancing)
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
        team1_label: m.team1Seed ? `Seed ${m.team1Seed}` : null,
        team2_label: m.isBye ? 'Bye' : (m.team2Seed ? `Seed ${m.team2Seed}` : null),
        team1_seed: m.team1Seed,
        team2_seed: m.isBye ? null : m.team2Seed,
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

  // Compute standings based on seeding method
  let seededTeams: TeamStanding[] = []

  if (bracket.seeding_method === 'standings') {
    const standings = await computeStandings(db, leagueId, org.id)

    if (bracket.division_id) {
      const divTeams = standings.filter((t) => t.divisionId === bracket.division_id)
      seededTeams = seedFromStandings(divTeams, bracket.teams_advancing)
    } else {
      const { data: divisions } = await db.from('divisions').select('id, name').eq('league_id', leagueId).eq('organization_id', org.id)

      if (divisions && divisions.length > 0) {
        const divisionStandings = divisions.map((div) => ({
          divisionId: div.id,
          divisionName: div.name,
          teams: standings.filter((t) => t.divisionId === div.id),
        }))
        seededTeams = seedFromDivisionStandings(divisionStandings, bracket.teams_advancing)
      } else {
        seededTeams = seedFromStandings(standings, bracket.teams_advancing)
      }
    }
  } else if (bracket.seeding_method === 'pool_results') {
    const standings = await computeStandings(db, leagueId, org.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pools } = await (db as any).from('pools').select('id, name').eq('league_id', leagueId).eq('organization_id', org.id)
    if (pools && pools.length > 0) {
      const poolStandings = pools.map((pool: { id: string; name: string }) => ({
        poolId: pool.id,
        poolName: pool.name,
        teams: standings.filter((t) => t.poolId === pool.id),
      }))
      seededTeams = seedFromPoolStandings(poolStandings, bracket.teams_advancing)
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

  // Generate the bracket structure
  const spec = bracket.bracket_type === 'double_elimination'
    ? generateDoubleEliminationSpec(bracket.teams_advancing)
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
        team1_label: null,
        team2_label: null,
        team1_seed: m.team1Seed,
        team2_seed: m.isBye ? null : m.team2Seed,
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
  return { error: null }
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
