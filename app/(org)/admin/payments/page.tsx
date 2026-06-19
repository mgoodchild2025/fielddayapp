import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
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
  registration_type: string | null
  guest_name: string | null
  guest_email: string | null
  player: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null
  league: { id: string; name: string; price_cents: number; drop_in_price_cents: number | null; currency: string; payment_mode: string } | { id: string; name: string; price_cents: number; drop_in_price_cents: number | null; currency: string; payment_mode: string }[] | null
  payment: PaymentRecord | PaymentRecord[] | null
}

export default async function AdminPaymentsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()
  const scope = await getAdminScope(org.id)

  let query = supabase
    .from('registrations')
    .select(`
      id, created_at, registration_type, guest_name, guest_email,
      player:profiles!registrations_user_id_fkey(id, full_name, email),
      league:leagues!registrations_league_id_fkey(id, name, price_cents, drop_in_price_cents, currency, payment_mode),
      payment:payments!payments_registration_id_fkey(id, amount_cents, currency, status, payment_method, paid_at, notes)
    `)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (!scope.isOrgAdmin && scope.assignedLeagueIds !== null) {
    if (scope.assignedLeagueIds.length === 0) {
      query = query.in('league_id', ['00000000-0000-0000-0000-000000000000'])
    } else {
      query = query.in('league_id', scope.assignedLeagueIds)
    }
  }

  const { data: rows } = await query as { data: RegistrationRow[] | null }

  const registrations = (rows ?? []).map(r => {
    // Guest registrations have no profile (user_id is null) — fall back to the
    // inline guest name/email so the Player column isn't blank.
    const player = (Array.isArray(r.player) ? r.player[0] : r.player)
      ?? (r.guest_name ? { id: '', full_name: r.guest_name, email: r.guest_email ?? '' } : null)
    const league = Array.isArray(r.league) ? r.league[0] : r.league
    const payment = Array.isArray(r.payment) ? r.payment[0] : r.payment

    const isDropIn = r.registration_type === 'drop_in'
    const effectivePrice = isDropIn
      ? (league?.drop_in_price_cents ?? league?.price_cents ?? 0)
      : (league?.price_cents ?? 0)
    const isFree = effectivePrice === 0
    let paymentStatus: string
    if (isFree) paymentStatus = 'free'
    else if (payment?.status === 'paid') paymentStatus = 'paid'
    else if (payment?.status === 'pending') paymentStatus = 'pending'
    else if (payment?.status === 'failed') paymentStatus = 'failed'
    else if (payment?.status === 'refunded') paymentStatus = 'refunded'
    else paymentStatus = 'unpaid'

    return { ...r, player: player ?? null, league: league ?? null, payment: payment ?? null, paymentStatus, isFree }
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Payments</h1>
      <PaymentsTable rows={registrations} isOrgAdmin={scope.isOrgAdmin} />
    </div>
  )
}
