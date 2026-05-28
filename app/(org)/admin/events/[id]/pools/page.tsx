import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { AdminPoolsManager } from '@/components/pools/admin-pools-manager'

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
      .select('id, name, event_type')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('pools')
      .select('id, name, sort_order')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('sort_order', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('teams')
      .select('id, name, pool_id, pool_sort_order')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .order('pool_sort_order', { ascending: true })
      .order('name'),
    // For "seed from standings" — confirmed regular-season game results
    db.from('game_results')
      .select('home_score, away_score, status, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status, pool_id)')
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
  const record: Record<string, { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }> = {}
  for (const t of teamList) {
    record[t.id] = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }
  }
  for (const r of (resultsData ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = Array.isArray(r.game) ? r.game[0] : r.game as any
    if (!game || game.status !== 'completed' || game.league_id !== id) continue
    // Only regular season games (no pool_id)
    if (game.pool_id) continue
    const ht = game.home_team_id as string
    const at = game.away_team_id as string
    if (!teamIdSet.has(ht) || !teamIdSet.has(at)) continue
    const hs = r.home_score ?? 0
    const as_ = r.away_score ?? 0
    record[ht].pointsFor += hs; record[ht].pointsAgainst += as_
    record[at].pointsFor += as_; record[at].pointsAgainst += hs
    if (hs > as_) { record[ht].wins++; record[at].losses++ }
    else if (as_ > hs) { record[at].wins++; record[ht].losses++ }
    else { record[ht].ties++; record[at].ties++ }
  }

  // Sort by wins desc, then point differential
  const standingsOrder = teamList
    .map((t) => ({ ...t, ...record[t.id] }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      const pdA = a.pointsFor - a.pointsAgainst
      const pdB = b.pointsFor - b.pointsAgainst
      return pdB - pdA
    })
    .map((t) => ({ id: t.id, name: t.name, wins: t.wins, losses: t.losses, ties: t.ties }))

  return (
    <AdminPoolsManager
      leagueId={id}
      initialPools={pools ?? []}
      initialTeams={teamList}
      standingsOrder={standingsOrder}
    />
  )
}
