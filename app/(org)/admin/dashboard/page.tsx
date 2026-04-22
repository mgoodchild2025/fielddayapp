import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminDashboardPage() {
  const headersList = headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const [
    { count: leagueCount },
    { count: memberCount },
    { data: recentPayments },
    { data: activeLeagues },
  ] = await Promise.all([
    supabase.from('leagues').select('*', { count: 'exact', head: true }).eq('organization_id', org.id).neq('status', 'archived'),
    supabase.from('org_members').select('*', { count: 'exact', head: true }).eq('organization_id', org.id).eq('status', 'active'),
    supabase.from('payments').select('amount_cents, currency, status, created_at, user_id').eq('organization_id', org.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('leagues').select('id, name, slug, status').eq('organization_id', org.id).in('status', ['registration_open', 'active']).limit(5),
  ])

  const totalRevenue = recentPayments?.filter((p) => p.status === 'paid').reduce((acc, p) => acc + p.amount_cents, 0) ?? 0

  const stats = [
    { label: 'Active Leagues', value: leagueCount ?? 0, href: '/admin/leagues' },
    { label: 'Members', value: memberCount ?? 0, href: '/admin/users' },
    { label: 'Recent Revenue', value: `$${(totalRevenue / 100).toFixed(0)}`, href: '/admin/payments' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{org.name} — Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="bg-white rounded-lg border p-5 hover:shadow-sm transition-shadow">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ fontFamily: 'var(--brand-heading-font)' }}>{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Active Leagues</h2>
            <Link href="/admin/leagues" className="text-sm hover:underline" style={{ color: 'var(--brand-primary)' }}>View all</Link>
          </div>
          <div className="space-y-2">
            {activeLeagues?.map((l) => (
              <Link key={l.id} href={`/admin/leagues/${l.id}`} className="flex items-center justify-between py-2 border-b last:border-0 hover:opacity-70">
                <span className="font-medium">{l.name}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${l.status === 'registration_open' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {l.status === 'registration_open' ? 'Open' : 'In Season'}
                </span>
              </Link>
            ))}
            {(!activeLeagues || activeLeagues.length === 0) && (
              <p className="text-sm text-gray-400 py-4 text-center">No active leagues</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Payments</h2>
            <Link href="/admin/payments" className="text-sm hover:underline" style={{ color: 'var(--brand-primary)' }}>View all</Link>
          </div>
          <div className="space-y-2">
            {recentPayments?.map((p) => (
              <div key={p.created_at} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm text-gray-600">{new Date(p.created_at).toLocaleDateString()}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span>
                  <span className="font-semibold">${(p.amount_cents / 100).toFixed(0)}</span>
                </div>
              </div>
            ))}
            {(!recentPayments || recentPayments.length === 0) && (
              <p className="text-sm text-gray-400 py-4 text-center">No payments yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
