import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { PaymentsTable } from '@/components/admin/payments-table'

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

export default async function AdminPaymentsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()

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
    .limit(500) as { data: RegistrationRow[] | null }

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

    return { ...r, player: player ?? null, league: league ?? null, payment: payment ?? null, paymentStatus, isFree }
  })

  const stats = {
    totalPaidCents: registrations
      .filter(r => r.payment?.status === 'paid')
      .reduce((sum, r) => sum + (r.payment?.amount_cents ?? 0), 0),
    paidCount: registrations.filter(r => r.paymentStatus === 'paid').length,
    unpaidCount: registrations.filter(r => r.paymentStatus === 'unpaid').length,
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Payments</h1>
      <PaymentsTable rows={registrations} stats={stats} />
    </div>
  )
}
