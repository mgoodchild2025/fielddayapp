import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { AdminDivisionsManager } from '@/components/divisions/admin-divisions-manager'

export default async function AdminDivisionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: league }, { data: divisions }, { data: teams }] = await Promise.all([
    db
      .from('leagues')
      .select('id, name, event_type')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
    db
      .from('divisions')
      .select('id, name, sort_order')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('sort_order', { ascending: true }),
    db
      .from('teams')
      .select('id, name, division_id')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .order('name'),
  ])

  if (!league) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((league as any).event_type !== 'league') {
    return (
      <div className="bg-white border rounded-lg p-8 text-center text-gray-500 text-sm">
        Divisions are only available for League events.
      </div>
    )
  }

  return (
    <AdminDivisionsManager
      leagueId={id}
      initialDivisions={divisions ?? []}
      initialTeams={(teams ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        division_id: t.division_id ?? null,
      }))}
    />
  )
}
