import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { TrashRowActions } from './trash-row-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Trash — Events' }

const RETENTION_DAYS = 30

export default async function EventsTrashPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const scope = await getAdminScope(org.id)
  if (!scope.isOrgAdmin) notFound()

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: trashed } = await (db as any)
    .from('leagues')
    .select('id, name, slug, status, event_type, season_start_date, deleted_at')
    .eq('organization_id', org.id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  type Row = { id: string; name: string; status: string; event_type: string | null; season_start_date: string | null; deleted_at: string }
  const rows: Row[] = trashed ?? []

  function daysLeft(deletedAt: string): number {
    const expiry = new Date(deletedAt).getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000
    return Math.max(0, Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000)))
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-1 text-sm text-gray-400">
        <Link href="/admin/events" className="hover:text-gray-600 transition-colors">Events</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-700 font-medium">Trash</span>
      </div>
      <h1 className="text-2xl font-bold mb-1">Trash</h1>
      <p className="text-sm text-gray-500 mb-6">
        Deleted events are kept here for {RETENTION_DAYS} days, then permanently removed.
        Restore an event to bring it back, or delete it permanently now.
      </p>

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
          Trash is empty.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white rounded-lg border p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold truncate">{r.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {r.event_type ?? 'league'} · deleted {new Date(r.deleted_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  <span className={daysLeft(r.deleted_at) <= 5 ? 'text-amber-600 font-medium' : ''}>
                    {daysLeft(r.deleted_at)} day{daysLeft(r.deleted_at) !== 1 ? 's' : ''} until permanent deletion
                  </span>
                </p>
              </div>
              <TrashRowActions leagueId={r.id} name={r.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
