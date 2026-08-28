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
  discount_cents: number | null
  discount_code: { code: string } | { code: string }[] | null
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
      payment:payments!payments_registration_id_fkey(id, amount_cents, tax_cents, currency, status, payment_method, paid_at, notes, discount_cents, discount_code:discount_codes(code))
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

  // Per-team leagues: the fee lives on a TEAM payment row (payment_type='team',
  // registration_id null), so it never embeds on the registration. Resolve each
  // member's team payment — same rule as the event registrations screen —
  // otherwise every member of a paid team reads "unpaid" here and the team-aware
  // Mark-as-Paid appears to do nothing.
  type TeamPaymentInfo = {
    id: string; amount_cents: number; tax_cents: number | null; currency: string
    status: string; payment_method: string | null; paid_at: string | null; teamName: string
  }
  const teamPayByLeagueUser = new Map<string, TeamPaymentInfo>()
  {
    const perTeamLeagueIds = [...new Set((rows ?? [])
      .map(r => Array.isArray(r.league) ? r.league[0] : r.league)
      .filter(l => l?.payment_mode === 'per_team' && (l?.price_cents ?? 0) > 0)
      .map(l => l!.id))]
    if (perTeamLeagueIds.length > 0) {
      const { data: teams } = await supabase
        .from('teams').select('id, league_id, name')
        .in('league_id', perTeamLeagueIds).eq('organization_id', org.id)
      const teamIds = (teams ?? []).map(t => t.id)
      const teamById = new Map((teams ?? []).map(t => [t.id, t]))
      if (teamIds.length > 0) {
        const [{ data: members }, { data: teamPays }] = await Promise.all([
          supabase.from('team_members').select('user_id, team_id')
            .in('team_id', teamIds).eq('status', 'active'),
          supabase.from('payments')
            .select('id, team_id, amount_cents, tax_cents, currency, status, payment_method, paid_at')
            .eq('organization_id', org.id).eq('payment_type', 'team').in('team_id', teamIds),
        ])
        // Prefer a paid row per team; otherwise keep whatever exists (pending/failed).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payByTeam = new Map<string, any>()
        for (const pmt of teamPays ?? []) {
          if (!pmt.team_id) continue
          const prev = payByTeam.get(pmt.team_id)
          if (!prev || pmt.status === 'paid' || pmt.status === 'manual') payByTeam.set(pmt.team_id, pmt)
        }
        for (const m of (members ?? []) as { user_id: string | null; team_id: string }[]) {
          if (!m.user_id) continue
          const pmt = payByTeam.get(m.team_id)
          const team = teamById.get(m.team_id)
          if (!pmt || !team) continue
          teamPayByLeagueUser.set(`${team.league_id}:${m.user_id}`, {
            id: pmt.id, amount_cents: pmt.amount_cents, tax_cents: pmt.tax_cents ?? null,
            currency: pmt.currency ?? 'cad', status: pmt.status,
            payment_method: pmt.payment_method ?? null, paid_at: pmt.paid_at ?? null,
            teamName: team.name,
          })
        }
      }
    }
  }

  const registrations = (rows ?? []).map(r => {
    // Guest registrations have no profile (user_id is null) — fall back to the
    // inline guest name/email so the Player column isn't blank.
    const player = (Array.isArray(r.player) ? r.player[0] : r.player)
      ?? (r.guest_name ? { id: '', full_name: r.guest_name, email: r.guest_email ?? '' } : null)
    const league = Array.isArray(r.league) ? r.league[0] : r.league
    const paymentRaw = Array.isArray(r.payment) ? r.payment[0] : r.payment
    const discountCode = paymentRaw
      ? (Array.isArray(paymentRaw.discount_code) ? paymentRaw.discount_code[0] : paymentRaw.discount_code)
      : null
    const payment = paymentRaw
      ? { ...paymentRaw, discountCode: discountCode?.code ?? null, discountCents: paymentRaw.discount_cents ?? 0 }
      : null

    const isDropIn = r.registration_type === 'drop_in'
    const effectivePrice = isDropIn
      ? (league?.drop_in_price_cents ?? league?.price_cents ?? 0)
      : (league?.price_cents ?? 0)
    const isFree = effectivePrice === 0
    // Per-team leagues: the member's payment state is the TEAM's payment state.
    const teamPayment = league?.payment_mode === 'per_team' && player?.id
      ? teamPayByLeagueUser.get(`${league.id}:${player.id}`) ?? null
      : null
    const statusSource = payment?.status ?? teamPayment?.status
    let paymentStatus: string
    if (isFree) paymentStatus = 'free'
    else if (statusSource === 'paid' || statusSource === 'manual') paymentStatus = 'paid'
    else if (statusSource === 'pending') paymentStatus = 'pending'
    else if (statusSource === 'failed') paymentStatus = 'failed'
    else if (statusSource === 'refunded') paymentStatus = 'refunded'
    else paymentStatus = 'unpaid'

    return { ...r, player: player ?? null, league: league ?? null, payment: payment ?? null, teamPayment, paymentStatus, isFree }
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Payments</h1>
      <PaymentsTable rows={registrations} isOrgAdmin={scope.isOrgAdmin} />
    </div>
  )
}
