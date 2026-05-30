import Link from 'next/link'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { auditActionLabel } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Audit Log — Settings' }

interface Props {
  searchParams: Promise<{ action?: string }>
}

export default async function AuditLogPage({ searchParams }: Props) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])
  const { action: actionFilter = '' } = await searchParams

  const db = createServiceRoleClient()

  // Distinct actions present (for the filter dropdown)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allActions } = await (db as any)
    .from('audit_logs').select('action').eq('organization_id', org.id)
  const actionTypes = [...new Set(((allActions ?? []) as { action: string }[]).map(a => a.action))].sort()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db as any)
    .from('audit_logs')
    .select('id, action, actor_label, target_type, target_label, metadata, created_at')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(250)
  if (actionFilter) query = query.eq('action', actionFilter)

  const { data: logs } = await query

  type LogRow = {
    id: string; action: string; actor_label: string | null
    target_type: string | null; target_label: string | null
    metadata: Record<string, unknown> | null; created_at: string
  }
  const rows: LogRow[] = logs ?? []

  return (
    <div className="max-w-3xl">
      <div className="mb-1 text-sm text-gray-400">
        <Link href="/admin/settings" className="hover:text-gray-600 transition-colors">Settings</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-700 font-medium">Audit Log</span>
      </div>
      <h1 className="text-2xl font-bold mb-1">Audit Log</h1>
      <p className="text-sm text-gray-500 mb-6">
        A record of important actions taken in your organization.
      </p>

      {/* Filter */}
      {actionTypes.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <form>
            <select
              name="action"
              defaultValue={actionFilter}
              className="border rounded-md px-3 py-2 text-sm bg-white"
              // Native form submit on change via the wrapping form
            >
              <option value="">All actions</option>
              {actionTypes.map(a => (
                <option key={a} value={a}>{auditActionLabel(a)}</option>
              ))}
            </select>
            <button type="submit" className="ml-2 text-sm px-3 py-2 rounded-md border bg-white hover:bg-gray-50">Filter</button>
          </form>
          {actionFilter && (
            <Link href="/admin/settings/audit" className="text-sm text-gray-400 hover:text-gray-600">Clear</Link>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
          No audit entries yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{auditActionLabel(r.action)}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {r.target_label && <span className="font-medium">{r.target_label}</span>}
                  {r.target_label && r.actor_label && ' · '}
                  {r.actor_label ? `by ${r.actor_label}` : 'by system'}
                </p>
              </div>
              <p className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                {new Date(r.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
