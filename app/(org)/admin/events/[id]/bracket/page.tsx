import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { PlayoffConfigWizard } from '@/components/bracket/playoff-config-wizard'
import { recommendBracket, seedFromStandings, seedFromDivisionStandings, seedFromPoolStandings, type TeamStanding } from '@/lib/bracket'
import type { BracketData, BracketMatchData, TeamRef } from '@/components/bracket/bracket-view'
import type { ExistingConfig } from '@/components/bracket/playoff-config-wizard'
import type { PoolSeedingMethod } from '@/actions/playoff-config'

export default async function AdminBracketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: leagueId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  const scope = await getAdminScope(org.id)

  // ── Load context ────────────────────────────────────────────────────────────
  const [{ data: league }, { data: divisions }, { data: poolsData }, { data: teams }, { data: results }, { count: unsettledCount }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, name, event_type, status, sport').eq('id', leagueId).eq('organization_id', org.id).single(),
    db.from('divisions').select('id, name').eq('league_id', leagueId).eq('organization_id', org.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('pools').select('id, name, sort_order').eq('league_id', leagueId).eq('organization_id', org.id).order('sort_order'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('teams').select('id, name, division_id, pool_id').eq('league_id', leagueId).eq('organization_id', org.id).eq('status', 'active'),
    db.from('game_results')
      .select('home_score, away_score, status, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status, pool_id)')
      .eq('organization_id', org.id)
      .eq('status', 'confirmed'),
    // Count regular season games that still need scores (status=scheduled = not yet completed/scored)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('organization_id', org.id)
      .eq('status', 'scheduled'),
  ])

  // ── Build standings ─────────────────────────────────────────────────────────
  const record: Record<string, TeamStanding> = {}
  const poolRecord: Record<string, TeamStanding> = {}
  for (const t of teams ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poolId = (t as any).pool_id ?? null
    record[t.id] = { teamId: t.id, teamName: t.name, divisionId: t.division_id, poolId, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }
    if (poolId) poolRecord[t.id] = { teamId: t.id, teamName: t.name, divisionId: t.division_id, poolId, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }
  }
  for (const r of results ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = Array.isArray(r.game) ? r.game[0] : r.game as any
    if (!game || game.status !== 'completed' || game.league_id !== leagueId) continue
    const ht = game.home_team_id as string; const at = game.away_team_id as string
    const isPoolGame = !!game.pool_id
    const target = isPoolGame ? poolRecord : record
    if (!target[ht] || !target[at]) continue
    const hs = r.home_score ?? 0; const as_ = r.away_score ?? 0
    target[ht].pointsFor += hs; target[ht].pointsAgainst += as_
    target[at].pointsFor += as_; target[at].pointsAgainst += hs
    if (hs > as_) { target[ht].wins++; target[at].losses++ }
    else if (as_ > hs) { target[at].wins++; target[ht].losses++ }
    else { target[ht].ties++; target[at].ties++ }
  }
  const allStandings = Object.values(record)
  const allPoolStandings = Object.values(poolRecord)

  const divisionCount = (divisions ?? []).length
  const poolList = (poolsData ?? []) as { id: string; name: string; sort_order: number }[]
  const poolCount = poolList.length

  const seededTeams = poolCount >= 2
    ? seedFromPoolStandings(
        poolList.map((pool) => ({
          poolId: pool.id,
          poolName: pool.name,
          teams: allPoolStandings.filter((t) => t.poolId === pool.id),
        })),
        (teams ?? []).length
      )
    : divisionCount >= 2
      ? seedFromDivisionStandings(
          (divisions ?? []).map((div) => ({
            divisionId: div.id,
            divisionName: div.name,
            teams: allStandings.filter((t) => t.divisionId === div.id),
          })),
          (teams ?? []).length
        )
      : seedFromStandings(allStandings, (teams ?? []).length)

  const recommendation = recommendBracket({
    teamCount: (teams ?? []).length,
    divisionCount,
    poolCount,
    eventType: league?.event_type ?? 'league',
  })

  // ── All teams ref (for match-edit override dropdowns) ───────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTeams: TeamRef[] = (teams ?? []).map((t: any) => ({ id: t.id, name: t.name }))

  // ── Load playoff config + tiers + bracket data ──────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamNameMap = new Map<string, string>((teams ?? []).map((t: any) => [t.id, t.name]))

  function buildBracketData(raw: {
    id: string; name: string; bracket_size: number; bracket_type?: string;
    third_place_game: boolean; status: string;
    bracket_matches: {
      id: string; round_number: number; match_number: number;
      team1_id: string | null; team2_id: string | null;
      team1_label: string | null; team2_label: string | null;
      team1_seed: number | null; team2_seed: number | null;
      is_bye: boolean; winner_team_id: string | null;
      score1: number | null; score2: number | null;
      sets: { s1: number; s2: number }[] | null;
      status: string; winner_to_match_id: string | null;
      loser_to_match_id: string | null;
      scheduled_at: string | null; court: string | null; notes: string | null;
      game_id: string | null;
    }[]
  }): BracketData {
    return {
      id: raw.id,
      name: raw.name,
      bracketSize: raw.bracket_size,
      bracketType: raw.bracket_type === 'double_elimination' ? 'double_elimination' : 'single_elimination',
      thirdPlaceGame: raw.third_place_game,
      status: raw.status,
      matches: (raw.bracket_matches ?? []).map((m): BracketMatchData => ({
        id: m.id,
        roundNumber: m.round_number,
        matchNumber: m.match_number,
        team1Id: m.team1_id,
        team2Id: m.team2_id,
        team1Name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? null) : null,
        team2Name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? null) : null,
        team1Label: m.team1_label,
        team2Label: m.team2_label,
        team1Seed: m.team1_seed,
        team2Seed: m.team2_seed,
        isBye: m.is_bye,
        winnerTeamId: m.winner_team_id,
        score1: m.score1,
        score2: m.score2,
        sets: m.sets ?? null,
        status: m.status as BracketMatchData['status'],
        scheduledAt: m.scheduled_at,
        court: m.court,
        notes: m.notes,
        winnerToMatchId: m.winner_to_match_id,
        loserToMatchId: m.loser_to_match_id ?? null,
        gameId: m.game_id ?? null,
      })),
    }
  }

  // Load config + tiers + brackets as separate queries to avoid PostgREST
  // schema-cache issues with newly created tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: configRow } = await (db as any)
    .from('playoff_configs')
    .select('id, seeding_method, advance_per_pool')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  let existingConfig: ExistingConfig | null = null

  if (configRow) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tiersData } = await (db as any)
      .from('playoff_tiers')
      .select('id, name, sort_order, seed_from, seed_to, bracket_type, third_place_game, bracket_id')
      .eq('config_id', configRow.id)
      .eq('organization_id', org.id)
      .order('sort_order', { ascending: true })

    // Load each tier's bracket (if any)
    type RawTier = {
      id: string; name: string; sort_order: number; seed_from: number; seed_to: number
      bracket_type: string; third_place_game: boolean; bracket_id: string | null
    }
    const sortedTiers: RawTier[] = (tiersData ?? [])

    const bracketIds = sortedTiers.map((t) => t.bracket_id).filter(Boolean) as string[]
    type RawBracket = Parameters<typeof buildBracketData>[0]
    const bracketMap = new Map<string, RawBracket>()

    if (bracketIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: bracketsData } = await (db as any)
        .from('brackets')
        .select(`
          id, name, bracket_size, bracket_type, third_place_game, status,
          bracket_matches (
            id, round_number, match_number,
            team1_id, team2_id, team1_label, team2_label,
            team1_seed, team2_seed,
            is_bye, winner_team_id, score1, score2, sets, status,
            winner_to_match_id, loser_to_match_id, scheduled_at, court, notes, game_id
          )
        `)
        .in('id', bracketIds)

      for (const b of (bracketsData ?? []) as RawBracket[]) {
        bracketMap.set(b.id, b)
      }
    }

    existingConfig = {
      id: configRow.id,
      seedingMethod: configRow.seeding_method as PoolSeedingMethod,
      advancePerPool: configRow.advance_per_pool as number[] | null ?? undefined,
      tiers: sortedTiers.map((t) => ({
        id: t.id,
        name: t.name,
        sortOrder: t.sort_order,
        seedFrom: t.seed_from,
        seedTo: t.seed_to,
        bracketType: (t.bracket_type === 'double_elimination' ? 'double_elimination' : 'single_elimination') as 'single_elimination' | 'double_elimination',
        thirdPlaceGame: t.third_place_game,
        bracketId: t.bracket_id,
        bracket: t.bracket_id ? buildBracketData(bracketMap.get(t.bracket_id)!) : null,
      })),
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bracket</h1>
          <p className="text-sm text-gray-500 mt-1">{league?.name}</p>
        </div>
      </div>

      <PlayoffConfigWizard
        leagueId={leagueId}
        sport={league?.sport ?? undefined}
        isOrgAdmin={scope.isOrgAdmin}
        seededTeams={seededTeams}
        allTeams={allTeams}
        recommendation={recommendation}
        existingConfig={existingConfig}
        unsettledCount={unsettledCount ?? 0}
        pools={poolList}
      />
    </div>
  )
}
