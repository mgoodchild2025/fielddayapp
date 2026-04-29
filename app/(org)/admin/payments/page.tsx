import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { MarkPaidForm } from '@/components/payments/mark-paid-form'

type PaymentRecord = {
  id: string
  amount_cents: number
  currency: string
  status: string
  payment_method: string | null
  paid_at: string | null
  notes: string | null
}

type RegistrationRow = {
  id: string
  created_at: string
  player: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null
  league: { id: string; name: string; price_cents: number; currency: string } | { id: string; name: string; price_cents: number; currency: string }[] | null
  payment: PaymentRecord | PaymentRecord[] | null
}

const statusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-purple-100 text-purple-700',
  unpaid: 'bg-gray-100 text-gray-500',
  free: 'bg-gray-100 text-gray-400',
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter = 'all' } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: rows } = await supabase
    .from('registrations')
    .select(`
      id, created_at,
      player:profiles!registrations_user_id_fkey(id, full_name, email),
      league:leagues!registrations_league_id_fkey(id, name, price_cents, currency),
      payment:payments!payments_registration_id_fkey(id, amount_cents, currency, status, payment_method, paid_at, notes)
    `)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(200) as { data: RegistrationRow[] | null }

  const registrations = (rows ?? []).map(r => {
    const player = Array.isArray(r.player) ? r.player[0] : r.player
    const league = Array.isArray(r.league) ? r.league[0] : r.league
    const payment = Array.isArray(r.payment) ? r.payment[0] : r.payment

    const isFree = !league || league.price_cents === 0
    let paymentStatus: string
    if (isFree) paymentStatus = 'free'
    else if (payment?.status === 'paid') paymentStatus = 'paid'
    else if (payment?.status === 'pending') paymentStatus = 'pending'
    else if (payment?.status === 'failed') paymentStatus = 'failed'
    else if (payment?.status === 'refunded') paymentStatus = 'refunded'
    else paymentStatus = 'unpaid'

    return { ...r, player, league, payment, paymentStatus, isFree }
  })

  const filtered = registrations.filter(r => {
    if (filter === 'paid') return r.paymentStatus === 'paid'
    if (filter === 'unpaid') return r.paymentStatus === 'unpaid' || r.paymentStatus === 'pending'
    return true
  })

  const totalPaidCents = registrations
    .filter(r => r.payment?.status === 'paid')
    .reduce((sum, r) => sum + (r.payment?.amount_cents ?? 0), 0)

  const unpaidCount = registrations.filter(r => r.paymentStatus === 'unpaid').length
  const paidCount = registrations.filter(r => r.paymentStatus === 'paid').length

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'paid', label: `Paid (${paidCount})` },
    { key: 'unpaid', label: `Unpaid / Pending (${unpaidCount})` },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Payments</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total Collected</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>
            ${(totalPaidCents / 100).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Paid</p>
          <p className="text-2xl font-bold mt-1">{paidCount}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Unpaid</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{unpaidCount}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {tabs.map(tab => (
          <a
            key={tab.key}
            href={`?filter=${tab.key}`}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.key ? 'text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
            style={filter === tab.key ? { backgroundColor: 'var(--brand-primary)' } : undefined}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Player</th>
                <th className="px-4 py-3 font-medium text-gray-500">League</th>
                <th className="px-4 py-3 font-medium text-gray-500">Amount</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Method</th>
                <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.player?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{r.player?.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.league?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold">
                    {r.isFree
                      ? <span className="text-gray-400 font-normal">Free</span>
                      : `$${((r.payment?.amount_cents ?? r.league?.price_cents ?? 0) / 100).toFixed(2)} ${(r.payment?.currency ?? r.league?.currency ?? 'cad').toUpperCase()}`
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[r.paymentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                      {r.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize text-xs">
                    {r.payment?.payment_method ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {r.payment?.paid_at
                      ? new Date(r.payment.paid_at).toLocaleDateString()
                      : new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {(r.paymentStatus === 'unpaid' || r.paymentStatus === 'pending' || r.paymentStatus === 'failed') && r.player && r.league && (
                      <MarkPaidForm
                        registrationId={r.id}
                        userId={r.player.id}
                        leagueId={r.league.id}
                        amountCents={r.league.price_cents}
                        currency={r.league.currency}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No registrations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
