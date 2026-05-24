import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { requireOrgMember } from '@/lib/auth'

// ── Types & helpers (mirrored from public event page) ─────────────────────────

type PtsMethod = 'wins' | 'set_wins' | 'set_differential' | 'points_for'
type VolleyballMode = 'match_based' | 'set_based'

interface TeamStat {
  id: string
  name: string
  division_id: string | null
  pool_id: string | null
  matchesPlayed: number
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  setWins: number
  setLosses: number
}

const VOLLEYBALL_SPORTS = new Set(['volleyball', 'beach_volleyball'])

function computePts(team: TeamStat, method: PtsMethod): number {
  switch (method) {
    case 'wins':             return team.wins
    case 'set_wins':         return team.setWins
    case 'set_differential': return team.setWins - team.setLosses
    case 'points_for':       return team.pointsFor
  }
}

function setRatio(team: TeamStat): number {
  return team.setLosses === 0 ? team.setWins : team.setWins / team.setLosses
}

function sortMatchBased(teams: TeamStat[], method: PtsMethod): TeamStat[] {
  return [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    const ptsDiff = computePts(b, method) - computePts(a, method)
    if (ptsDiff !== 0) return ptsDiff
    const ratioDiff = setRatio(b) - setRatio(a)
    if (ratioDiff !== 0) return ratioDiff
    return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
  })
}

function sortSetBased(teams: TeamStat[]): TeamStat[] {
  return [...teams].sort((a, b) => {
    if (b.setWins !== a.setWins) return b.setWins - a.setWins
    const sdDiff = (b.setWins - b.setLosses) - (a.setWins - a.setLosses)
    if (sdDiff !== 0) return sdDiff
    return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
  })
}

function sortTeams(teams: TeamStat[], isVolleyball: boolean, mode: VolleyballMode, method: PtsMethod): TeamStat[] {
  return isVolleyball && mode === 'set_based'
    ? sortSetBased(teams)
    : sortMatchBased(teams, method)
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
  const sorted = sortTeams(teams, isVolleyball, mode, method)

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
                <td className="px-3 py-2 font-medium">{t.name}</td>
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
                <td className="px-3 py-2 font-medium">{t.name}</td>
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: teamsData }, { data: divsData }, { data: poolsData }, { data: resultsData }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('teams').select('id, name, division_id, pool_id').eq('league_id', id).eq('organization_id', org.id).eq('status', 'active'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('divisions').select('id, name, sort_order').eq('league_id', id).eq('organization_id', org.id).order('sort_order'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('pools').select('id, name, sort_order').eq('league_id', id).eq('organization_id', org.id).order('sort_order'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('game_results')
      .select('home_score, away_score, status, sets, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status, pool_id)')
      .eq('organization_id', org.id)
      .eq('status', 'confirmed'),
  ])

  const divisions: { id: string; name: string; sort_order: number }[] = divsData ?? []
  const pools: { id: string; name: string; sort_order: number }[] = poolsData ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueTeamIds = new Set<string>((teamsData ?? []).map((t: any) => t.id as string))

  const blankStat = () => ({
    matchesPlayed: 0, wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0, setWins: 0, setLosses: 0,
  })

  // record = regular season games (no pool_id); poolRecord = pool-play games (has pool_id)
  const record: Record<string, ReturnType<typeof blankStat>> = {}
  const poolRecord: Record<string, ReturnType<typeof blankStat>> = {}
  // combinedRecord = all games regardless of pool_id (for overall ranking when pools exist)
  const combinedRecord: Record<string, ReturnType<typeof blankStat>> = {}

  for (const r of resultsData ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = Array.isArray(r.game) ? r.game[0] : r.game as any
    if (!game || game.status !== 'completed' || game.league_id !== id) continue
    const { home_team_id: ht, away_team_id: at, pool_id: gamePool } = game
    if (!ht || !at || !leagueTeamIds.has(ht) || !leagueTeamIds.has(at)) continue

    const isPoolGame = !!gamePool
    const target = isPoolGame ? poolRecord : record

    for (const rec of [target, combinedRecord]) {
      if (!rec[ht]) rec[ht] = blankStat()
      if (!rec[at]) rec[at] = blankStat()
      rec[ht].matchesPlayed++
      rec[at].matchesPlayed++
      const hs = r.home_score ?? 0
      const as_ = r.away_score ?? 0
      if (hs > as_) { rec[ht].wins++; rec[at].losses++ }
      else if (as_ > hs) { rec[at].wins++; rec[ht].losses++ }
      else { rec[ht].ties++; rec[at].ties++ }
      if (isVolleyball && Array.isArray(r.sets)) {
        for (const s of r.sets as { home: number; away: number }[]) {
          rec[ht].pointsFor += s.home; rec[ht].pointsAgainst += s.away
          rec[at].pointsFor += s.away; rec[at].pointsAgainst += s.home
          if (s.home > s.away) { rec[ht].setWins++; rec[at].setLosses++ }
          else if (s.away > s.home) { rec[at].setWins++; rec[ht].setLosses++ }
        }
      } else {
        rec[ht].pointsFor += hs; rec[ht].pointsAgainst += as_
        rec[at].pointsFor += as_; rec[at].pointsAgainst += hs
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildTeamStats = (src: Record<string, ReturnType<typeof blankStat>>) => (teamsData ?? []).map((t: any) => ({
    id: t.id, name: t.name,
    division_id: t.division_id ?? null,
    pool_id: t.pool_id ?? null,
    ...(src[t.id] ?? blankStat()),
  })) as TeamStat[]

  const regularTeams   = buildTeamStats(record)
  const poolTeams      = buildTeamStats(poolRecord).filter((t) => t.pool_id)
  const combinedTeams  = buildTeamStats(combinedRecord)

  const hasRegular  = Object.keys(record).some((k) => record[k].matchesPlayed > 0)
  const hasPoolPlay = Object.keys(poolRecord).some((k) => poolRecord[k].matchesPlayed > 0)
  const hasPools    = pools.length > 0

  // Compute overall rank order for cross-pool ranking
  const overallSorted = sortTeams(combinedTeams, isVolleyball, volleyballMode, ptsMethod)

  return (
    <div className="space-y-8">

      {/* ── Pool Play section ──────────────────────────────────────────────── */}
      {hasPools && (
        <section>
          <h2 className="text-base font-semibold mb-1">Pool Play Standings</h2>
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

      {/* ── Overall standings (cross-pool) ─────────────────────────────────── */}
      {hasPools && (
        <section>
          <h2 className="text-base font-semibold mb-1">Overall Standings</h2>
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

      {/* ── Regular season standings ────────────────────────────────────────── */}
      {hasRegular && (
        <section>
          <h2 className="text-base font-semibold mb-1">
            {hasPools ? 'Regular Season Standings' : 'Standings'}
          </h2>
          {hasPools && (
            <p className="text-xs text-gray-500 mb-4">Games played before pool play began.</p>
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
              {regularTeams.filter((t) => !t.division_id && record[t.id]?.matchesPlayed > 0).length > 0 && (
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

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!hasRegular && !hasPoolPlay && (
        <p className="text-gray-400 text-center py-16">No confirmed results yet. Standings will appear once scores are submitted and confirmed.</p>
      )}

    </div>
  )
}
