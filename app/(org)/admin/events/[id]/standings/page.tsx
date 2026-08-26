import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { requireOrgMember } from '@/lib/auth'
import {
  computePts, sortStandings, VOLLEYBALL_SPORTS,
  accumulateGameResult, emptyTeamStat,
  type TeamStat as BaseTeamStat, type TeamStatTotals,
  type PtsMethod, type VolleyballMode,
} from '@/lib/standings'
import { TeamAvatar } from '@/components/ui/team-avatar'

// Standings rows on this page additionally carry division/pool grouping.
interface TeamStat extends BaseTeamStat {
  division_id: string | null
  pool_id: string | null
}

// ── StandingsTable component ──────────────────────────────────────────────────

function StandingsTable({
  teams,
  sport,
  ptsMethod,
  volleyballMode,
  showRank = false,
  rankOffset = 0,
}: {
  teams: TeamStat[]
  sport?: string | null
  ptsMethod?: PtsMethod
  volleyballMode?: VolleyballMode
  showRank?: boolean
  rankOffset?: number
}) {
  const isVolleyball = VOLLEYBALL_SPORTS.has(sport ?? '')
  const mode: VolleyballMode = volleyballMode ?? 'match_based'
  const method: PtsMethod = ptsMethod ?? 'wins'
  const sorted = sortStandings(teams, sport, mode, method)

  if (sorted.length === 0) {
    return <p className="text-gray-400 text-sm py-6 text-center">No results yet.</p>
  }

  if (isVolleyball && mode === 'set_based') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 460 }}>
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-gray-500 font-medium">
              {showRank && <th className="px-3 py-2 text-center w-8">#</th>}
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-center">MP</th>
              <th className="px-3 py-2 text-center">SW</th>
              <th className="px-3 py-2 text-center">SL</th>
              <th className="px-3 py-2 text-center">SPF</th>
              <th className="px-3 py-2 text-center">SPA</th>
              <th className="px-3 py-2 text-center">PD</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((t, i) => (
              <tr key={t.id} className="hover:bg-gray-50">
                {showRank && <td className="px-3 py-2 text-center text-xs font-bold text-gray-400">{rankOffset + i + 1}</td>}
                <td className="px-3 py-2 font-medium">
                  <span className="flex items-center gap-2 min-w-0">
                    <TeamAvatar logoUrl={t.logoUrl ?? null} color={t.color ?? null} name={t.name} size="sm" />
                    <span className="truncate">{t.name}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{t.matchesPlayed}</td>
                <td className="px-3 py-2 text-center tabular-nums font-semibold">{t.setWins}</td>
                <td className="px-3 py-2 text-center tabular-nums">{t.setLosses}</td>
                <td className="px-3 py-2 text-center tabular-nums">{t.pointsFor}</td>
                <td className="px-3 py-2 text-center tabular-nums">{t.pointsAgainst}</td>
                <td className="px-3 py-2 text-center tabular-nums">{t.pointsFor - t.pointsAgainst > 0 ? '+' : ''}{t.pointsFor - t.pointsAgainst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: 400 }}>
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-gray-500 font-medium">
            {showRank && <th className="px-3 py-2 text-center w-8">#</th>}
            <th className="px-3 py-2 text-left">Team</th>
            <th className="px-3 py-2 text-center">GP</th>
            <th className="px-3 py-2 text-center">W</th>
            <th className="px-3 py-2 text-center">L</th>
            <th className="px-3 py-2 text-center">T</th>
            <th className="px-3 py-2 text-center">PF</th>
            <th className="px-3 py-2 text-center">PA</th>
            <th className="px-3 py-2 text-center">Diff</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((t, i) => {
            const diff = t.pointsFor - t.pointsAgainst
            return (
              <tr key={t.id} className="hover:bg-gray-50">
                {showRank && <td className="px-3 py-2 text-center text-xs font-bold text-gray-400">{rankOffset + i + 1}</td>}
                <td className="px-3 py-2 font-medium">
                  <span className="flex items-center gap-2 min-w-0">
                    <TeamAvatar logoUrl={t.logoUrl ?? null} color={t.color ?? null} name={t.name} size="sm" />
                    <span className="truncate">{t.name}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{t.matchesPlayed}</td>
                <td className="px-3 py-2 text-center tabular-nums font-semibold">{t.wins}</td>
                <td className="px-3 py-2 text-center tabular-nums">{t.losses}</td>
                <td className="px-3 py-2 text-center tabular-nums">{t.ties}</td>
                <td className="px-3 py-2 text-center tabular-nums">{t.pointsFor}</td>
                <td className="px-3 py-2 text-center tabular-nums">{t.pointsAgainst}</td>
                <td className="px-3 py-2 text-center tabular-nums">{diff > 0 ? '+' : ''}{diff}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminStandingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org)

  const db = createServiceRoleClient()


  const { data: league } = await db
    .from('leagues')
    .select('id, name, sport, status, event_type, standings_pts_method, volleyball_standings_mode')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!league || (league.event_type !== 'league' && league.event_type !== 'tournament')) {
    notFound()
  }

  const sport: string = league.sport ?? ''
  const ptsMethod: PtsMethod = (league.standings_pts_method ?? 'wins') as PtsMethod
  const volleyballMode: VolleyballMode = (league.volleyball_standings_mode ?? 'match_based') as VolleyballMode
  const isVolleyball = VOLLEYBALL_SPORTS.has(sport)


  const [{ data: teamsData }, { data: divsData }, { data: poolsData }, { data: resultsData }] = await Promise.all([

    db.from('teams').select('id, name, division_id, pool_id, logo_url, color').eq('league_id', id).eq('organization_id', org.id).eq('status', 'active'),

    db.from('divisions').select('id, name, sort_order').eq('league_id', id).eq('organization_id', org.id).order('sort_order'),

    db.from('pools').select('id, name, sort_order').eq('league_id', id).eq('organization_id', org.id).order('sort_order'),

    db.from('game_results')
      .select('home_score, away_score, status, sets, is_forfeit, forfeit_team_id, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status, pool_id)')
      .eq('organization_id', org.id)
      .eq('status', 'confirmed'),
  ])

  const divisions: { id: string; name: string; sort_order: number }[] = (divsData ?? []).map((d) => ({ ...d, sort_order: d.sort_order ?? 0 }))
  const pools: { id: string; name: string; sort_order: number }[] = (poolsData ?? []).map((p) => ({ ...p, sort_order: p.sort_order ?? 0 }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueTeamIds = new Set<string>((teamsData ?? []).map((t: any) => t.id as string))

  // record = regular season games (no pool_id); poolRecord = pool-play games (has pool_id)
  const record = new Map<string, TeamStatTotals>()
  const poolRecord = new Map<string, TeamStatTotals>()
  // combinedRecord = all games regardless of pool_id (for overall ranking when pools exist)
  const combinedRecord = new Map<string, TeamStatTotals>()

  for (const r of resultsData ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = Array.isArray(r.game) ? r.game[0] : r.game as any
    if (!game || game.status !== 'completed' || game.league_id !== id) continue
    const { home_team_id: ht, away_team_id: at, pool_id: gamePool } = game
    if (!ht || !at || !leagueTeamIds.has(ht) || !leagueTeamIds.has(at)) continue

    const input = {
      homeTeamId: ht, awayTeamId: at,
      homeScore: r.home_score, awayScore: r.away_score,
      sets: r.sets as { home: number; away: number }[] | null, isForfeit: r.is_forfeit, forfeitTeamId: r.forfeit_team_id,
    }
    accumulateGameResult(gamePool ? poolRecord : record, input, isVolleyball)
    accumulateGameResult(combinedRecord, input, isVolleyball)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildTeamStats = (src: Map<string, TeamStatTotals>) => (teamsData ?? []).map((t: any) => ({
    id: t.id, name: t.name,
    logoUrl: t.logo_url ?? null,
    color: t.color ?? null,
    division_id: t.division_id ?? null,
    pool_id: t.pool_id ?? null,
    ...(src.get(t.id) ?? emptyTeamStat()),
  })) as TeamStat[]

  const regularTeams   = buildTeamStats(record)
  const poolTeams      = buildTeamStats(poolRecord).filter((t) => t.pool_id)
  const combinedTeams  = buildTeamStats(combinedRecord)

  const hasRegular  = [...record.values()].some((s) => s.matchesPlayed > 0)
  const hasPoolPlay = [...poolRecord.values()].some((s) => s.matchesPlayed > 0)
  const hasPools    = pools.length > 0

  // Compute overall rank order for cross-pool ranking
  const overallSorted = sortStandings(combinedTeams, sport, volleyballMode, ptsMethod)

  return (
    <div className="space-y-8">

      {/* ── Regular season ─────────────────────────────────────────────────── */}
      {hasRegular && (
        <section>
          {hasPools && (
            <>
              <h2 className="text-base font-semibold mb-1">Regular Season</h2>
              <p className="text-xs text-gray-500 mb-4">Games played before pool play began.</p>
            </>
          )}
          {divisions.length > 0 ? (
            <div className="space-y-6">
              {divisions.map((div) => {
                const divTeams = regularTeams.filter((t) => t.division_id === div.id)
                if (divTeams.length === 0) return null
                return (
                  <div key={div.id} className="bg-white rounded-lg border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{div.name}</p>
                    </div>
                    <StandingsTable
                      teams={divTeams}
                      sport={sport}
                      ptsMethod={ptsMethod}
                      volleyballMode={volleyballMode}
                      showRank
                    />
                  </div>
                )
              })}
              {regularTeams.filter((t) => !t.division_id && (record.get(t.id)?.matchesPlayed ?? 0) > 0).length > 0 && (
                <div className="bg-white rounded-lg border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Unassigned</p>
                  </div>
                  <StandingsTable
                    teams={regularTeams.filter((t) => !t.division_id)}
                    sport={sport}
                    ptsMethod={ptsMethod}
                    volleyballMode={volleyballMode}
                    showRank
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <StandingsTable
                teams={regularTeams}
                sport={sport}
                ptsMethod={ptsMethod}
                volleyballMode={volleyballMode}
                showRank
              />
            </div>
          )}
        </section>
      )}

      {/* ── Pool Play ──────────────────────────────────────────────────────── */}
      {hasPools && (
        <section>
          <h2 className="text-base font-semibold mb-1">Pool Play</h2>
          <p className="text-xs text-gray-500 mb-4">Rankings are within each pool. Overall ranking across all pools is shown below.</p>

          {!hasPoolPlay ? (
            <p className="text-gray-400 text-sm py-6 text-center">No pool play results recorded yet.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {pools.map((pool) => {
                const thisPoolTeams = poolTeams.filter((t) => t.pool_id === pool.id)
                if (thisPoolTeams.length === 0) return null
                return (
                  <div key={pool.id} className="bg-white rounded-lg border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{pool.name}</p>
                    </div>
                    <StandingsTable
                      teams={thisPoolTeams}
                      sport={sport}
                      ptsMethod={ptsMethod}
                      volleyballMode={volleyballMode}
                      showRank
                    />
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Overall (cross-pool) ───────────────────────────────────────────── */}
      {hasPools && (
        <section>
          <h2 className="text-base font-semibold mb-1">Overall</h2>
          <p className="text-xs text-gray-500 mb-4">All teams ranked together across pool play results — used for seeding playoffs.</p>
          {!hasPoolPlay ? (
            <p className="text-gray-400 text-sm py-6 text-center">No pool play results recorded yet.</p>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <StandingsTable
                teams={overallSorted.filter((t) => t.pool_id)}
                sport={sport}
                ptsMethod={ptsMethod}
                volleyballMode={volleyballMode}
                showRank
              />
            </div>
          )}
        </section>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!hasRegular && !hasPoolPlay && (
        <p className="text-gray-400 text-center py-16">No confirmed results yet. Standings will appear once scores are submitted and confirmed.</p>
      )}

    </div>
  )
}
