import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import Link from 'next/link'

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  full: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-600',
  completed: 'bg-gray-100 text-gray-600',
}

export default async function AdminDropInsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()

  const { data: sessions } = await supabase
    .from('drop_in_sessions')
    .select('*, drop_in_registrations(count)')
    .eq('organization_id', org.id)
    .order('scheduled_at', { ascending: false })

  const rows = sessions ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Drop-in Sessions</h1>
        <Link
          href="/admin/dropins/new"
          className="px-4 py-2 rounded-md text-white text-sm font-medium"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          + New Session
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center">
          <p className="text-gray-400 mb-4">No drop-in sessions yet.</p>
          <Link href="/admin/dropins/new" className="text-sm font-medium underline" style={{ color: 'var(--brand-primary)' }}>
            Create your first session →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Session', 'Date & Time', 'Location', 'Registered', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(s => {
                const regCount = Array.isArray(s.drop_in_registrations)
                  ? s.drop_in_registrations.reduce((n: number, r: { count: number }) => n + (r.count ?? 0), 0)
                  : 0
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {new Date(s.scheduled_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{s.location ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-700">{regCount} / {s.capacity}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/admin/dropins/${s.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                        Manage →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
