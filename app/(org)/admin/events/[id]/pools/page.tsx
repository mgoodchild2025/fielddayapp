import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { AdminPoolsManager } from '@/components/pools/admin-pools-manager'

export default async function AdminPoolsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: league }, { data: pools }, { data: teams }] = await Promise.all([
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
    db
      .from('teams')
      .select('id, name, pool_id')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .order('name'),
  ])

  if (!league) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((league as any).event_type !== 'tournament') {
    return (
      <div className="bg-white border rounded-lg p-8 text-center text-gray-500 text-sm">
        Pools are only available for Tournament events.
      </div>
    )
  }

  return (
    <AdminPoolsManager
      leagueId={id}
      initialPools={pools ?? []}
      initialTeams={(teams ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        pool_id: (t as { pool_id?: string | null }).pool_id ?? null,
      }))}
    />
  )
}
