import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'

type PaymentRow = {
  id: string
  amount_cents: number
  currency: string
  status: string
  payment_method: string
  created_at: string
  paid_at: string | null
  notes: string | null
  user: { full_name: string; email: string } | { full_name: string; email: string }[] | null
  league: { name: string } | { name: string }[] | null
}

const statusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-purple-100 text-purple-700',
  manual: 'bg-blue-100 text-blue-700',
}

export default async function AdminPaymentsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: payments } = await supabase
    .from('payments')
    .select(`
      id, amount_cents, currency, status, payment_method, created_at, paid_at, notes,
      user:profiles!payments_user_id_fkey(full_name, email),
      league:leagues!payments_league_id_fkey(name)
    `)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(100) as { data: PaymentRow[] | null; error: unknown }

  const totalPaid = payments?.filter((p) => p.status === 'paid').reduce((acc, p) => acc + p.amount_cents, 0) ?? 0
  const pendingCount = payments?.filter((p) => p.status === 'pending').length ?? 0

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Payments</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total Collected</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>${(totalPaid / 100).toFixed(0)}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total Transactions</p>
          <p className="text-2xl font-bold mt-1">{payments?.length ?? 0}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold mt-1">{pendingCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Player</th>
              <th className="px-4 py-3 font-medium text-gray-500">League</th>
              <th className="px-4 py-3 font-medium text-gray-500">Amount</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Method</th>
              <th className="px-4 py-3 font-medium text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody>
            {payments?.map((p) => {
              const user = Array.isArray(p.user) ? p.user[0] : p.user
              const league = Array.isArray(p.league) ? p.league[0] : p.league
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{user?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{user?.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{league?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold">${(p.amount_cents / 100).toFixed(2)} {p.currency.toUpperCase()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{p.payment_method}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              )
            })}
            {(!payments || payments.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No payments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
