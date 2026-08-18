import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { AdminPoolsManager } from '@/components/pools/admin-pools-manager'
import { sortStandings, isVolleyballSport, accumulateGameResult, emptyTeamStat, type TeamStatTotals, type PtsMethod, type VolleyballMode } from '@/lib/standings'

export default async function AdminPoolsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  if (!await canAccess(org.id, 'pools_divisions')) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Pools & Divisions</h1>
        <UpgradePrompt feature="Pools & divisions" requiredTier="pro" />
      </div>
    )
  }

  const db = createServiceRoleClient()

  const [{ data: league }, { data: pools }, { data: teams }, { data: resultsData }] = await Promise.all([
    db
      .from('leagues')
      .select('id, name, event_type, sport, standings_pts_method, volleyball_standings_mode')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),

    db
      .from('pools')
      .select('id, name, sort_order')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('sort_order', { ascending: true }),

    db
      .from('teams')
      .select('id, name, pool_id, pool_sort_order')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .order('pool_sort_order', { ascending: true })
      .order('name'),
    // For "seed from standings" — confirmed regular-season game results

    db.from('game_results')
      .select('home_score, away_score, status, sets, is_forfeit, forfeit_team_id, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status, pool_id)')
      .eq('organization_id', org.id)
      .eq('status', 'confirmed'),
  ])

  if (!league) notFound()

  // Compute regular-season standings (exclude pool play games which have pool_id set)
  const teamList: { id: string; name: string; pool_id: string | null; pool_sort_order: number }[] = (teams ?? []).map(
    (t: { id: string; name: string; pool_id?: string | null; pool_sort_order?: number }) => ({
      id: t.id,
      name: t.name,
      pool_id: t.pool_id ?? null,
      pool_sort_order: t.pool_sort_order ?? 0,
    })
  )
  const teamIdSet = new Set(teamList.map((t) => t.id))

  // Standings config from the event details — the seed order must honor these,
  // matching the standings tab (lib/standings.ts / admin standings page).
  const sport: string | null = (league as { sport?: string | null }).sport ?? null
  const ptsMethod: PtsMethod = ((league as { standings_pts_method?: string }).standings_pts_method ?? 'wins') as PtsMethod
  const volleyballMode: VolleyballMode = ((league as { volleyball_standings_mode?: string }).volleyball_standings_mode ?? 'match_based') as VolleyballMode
  const isVolleyball = isVolleyballSport(sport)

  const record = new Map<string, TeamStatTotals>(teamList.map((t) => [t.id, emptyTeamStat()]))

  for (const r of (resultsData ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = Array.isArray(r.game) ? r.game[0] : r.game as any
    if (!game || game.status !== 'completed' || game.league_id !== id) continue
    // Only regular season games (no pool_id) feed pool seeding
    if (game.pool_id) continue
    const ht = game.home_team_id as string
    const at = game.away_team_id as string
    if (!teamIdSet.has(ht) || !teamIdSet.has(at)) continue

    accumulateGameResult(record, {
      homeTeamId: ht, awayTeamId: at,
      homeScore: r.home_score, awayScore: r.away_score,
      sets: r.sets as { home: number; away: number }[] | null, isForfeit: r.is_forfeit, forfeitTeamId: r.forfeit_team_id,
    }, isVolleyball)
  }

  // Sort using the configured standings mode/method (same as the standings tab)
  const standingsOrder = sortStandings(
    teamList.map((t) => ({ id: t.id, name: t.name, ...(record.get(t.id) ?? emptyTeamStat()) })),
    sport,
    volleyballMode,
    ptsMethod,
  ).map((t) => ({
    id: t.id, name: t.name,
    wins: t.wins, losses: t.losses, ties: t.ties,
    setWins: t.setWins, setLosses: t.setLosses,
  }))

  return (
    <AdminPoolsManager
      leagueId={id}
      initialPools={pools ?? []}
      initialTeams={teamList}
      standingsOrder={standingsOrder}
      standingsSetBased={isVolleyball && volleyballMode === 'set_based'}
    />
  )
}
