import { createServiceRoleClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { CreateOrgButton } from './create-org-button'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
}

const PLAN_STYLES: Record<string, string> = {
  internal: 'bg-purple-100 text-purple-800',
  club: 'bg-blue-100 text-blue-800',
  pro: 'bg-indigo-100 text-indigo-800',
  starter: 'bg-gray-100 text-gray-700',
}

export default async function PlatformSuperPage() {
  const supabase = createServiceRoleClient()

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, slug, sport, city, status, created_at, subscriptions(plan_tier, status)')
    .order('created_at', { ascending: false })

  // Fetch member counts separately
  const orgIds = (orgs ?? []).map(o => o.id)
  const { data: memberRows } = await supabase
    .from('org_members')
    .select('organization_id')
    .in('organization_id', orgIds)

  const memberCounts: Record<string, number> = {}
  for (const row of memberRows ?? []) {
    memberCounts[row.organization_id] = (memberCounts[row.organization_id] ?? 0) + 1
  }

  const total = orgs?.length ?? 0
  const active = orgs?.filter(o => o.status === 'active').length ?? 0
  const trial = orgs?.filter(o => o.status === 'trial').length ?? 0
  const suspended = orgs?.filter(o => o.status === 'suspended').length ?? 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Organizations</h1>
        <CreateOrgButton />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: total, color: 'text-white' },
          { label: 'Active', value: active, color: 'text-green-400' },
          { label: 'Trial', value: trial, color: 'text-yellow-400' },
          { label: 'Suspended', value: suspended, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Name', 'Slug', 'Sport', 'City', 'Status', 'Plan', 'Members', 'Created', ''].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {(orgs ?? []).map(org => {
              const sub = Array.isArray(org.subscriptions) ? org.subscriptions[0] : org.subscriptions
              return (
                <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">{org.name}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-sm">{org.slug}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-sm capitalize">
                    {org.sport?.replace('_', ' ') ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-sm">{org.city ?? '—'}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[org.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {org.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_STYLES[sub?.plan_tier ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>
                      {sub?.plan_tier ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-sm whitespace-nowrap">
                    {memberCounts[org.id] ?? 0}
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-sm whitespace-nowrap">
                    {new Date(org.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-right">
                    <Link
                      href={`/super/orgs/${org.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              )
            })}
            {(!orgs || orgs.length === 0) && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-400">
                  No organizations yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
