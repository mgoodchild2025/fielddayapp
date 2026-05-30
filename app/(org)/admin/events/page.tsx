import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import Link from 'next/link'
import { EventsTable } from '@/components/admin/events-table'

export default async function AdminEventsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  const scope = await getAdminScope(org.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db as any)
    .from('leagues')
    .select('id, name, slug, status, event_type, sport, logo_url, price_cents, currency, season_start_date, venue_name, created_at')
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!scope.isOrgAdmin && scope.assignedLeagueIds !== null) {
    if (scope.assignedLeagueIds.length === 0) {
      query = query.in('id', ['00000000-0000-0000-0000-000000000000']) // no results
    } else {
      query = query.in('id', scope.assignedLeagueIds)
    }
  }

  const { data: leagues } = await query

  // Count soft-deleted events for the Trash link (org admins only)
  let trashCount = 0
  if (scope.isOrgAdmin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (db as any)
      .from('leagues')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .not('deleted_at', 'is', null)
    trashCount = count ?? 0
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-sm text-gray-500 mt-1">{leagues?.length ?? 0} event{leagues?.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {scope.isOrgAdmin && trashCount > 0 && (
            <Link
              href="/admin/events/trash"
              className="text-sm text-gray-500 hover:text-gray-700 border rounded-md px-3 py-2 bg-white"
            >
              🗑 Trash ({trashCount})
            </Link>
          )}
          {scope.isOrgAdmin && (
            <Link
              href="/admin/events/new"
              className="px-4 py-2 rounded-md text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              + New Event
            </Link>
          )}
        </div>
      </div>

      <EventsTable leagues={leagues ?? []} />
    </div>
  )
}
