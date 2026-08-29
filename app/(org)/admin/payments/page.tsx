import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { PaymentsTable } from '@/components/admin/payments-table'

type PaymentRecord = {
  id: string
  amount_cents: number
  refunded_cents?: number | null
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
      payment:payments!payments_registration_id_fkey(id, amount_cents, tax_cents, refunded_cents, currency, status, payment_method, paid_at, notes, discount_cents, discount_code:discount_codes(code))
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
  // registration_id null), so it never embeds on the registration. The ledger
  // shows ONE row per team — not the fee repeated on every member — so build
  // those rows here; member rows without a payment of their own are dropped below.
  type TeamLedgerRow = {
    id: string
    created_at: string
    teamId: string
    teamName: string
    league: { id: string; name: string; price_cents: number; drop_in_price_cents: number | null; currency: string; payment_mode: string }
    payment: (PaymentRecord & { discountCode: string | null; discountCents: number }) | null
  }
  const teamLedgerRows: TeamLedgerRow[] = []
  {
    const perTeamLeagues = new Map<string, TeamLedgerRow['league']>()
    for (const r of rows ?? []) {
      const l = Array.isArray(r.league) ? r.league[0] : r.league
      if (l?.payment_mode === 'per_team' && (l?.price_cents ?? 0) > 0) perTeamLeagues.set(l.id, l)
    }
    if (perTeamLeagues.size > 0) {
      const { data: teams } = await supabase
        .from('teams').select('id, league_id, name, created_at')
        .in('league_id', [...perTeamLeagues.keys()]).eq('organization_id', org.id).eq('status', 'active')
      const teamIds = (teams ?? []).map(t => t.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payByTeam = new Map<string, any>()
      if (teamIds.length > 0) {
        const { data: teamPays } = await supabase
          .from('payments')
          .select('id, team_id, amount_cents, tax_cents, refunded_cents, currency, status, payment_method, paid_at, notes')
          .eq('organization_id', org.id).eq('payment_type', 'team').in('team_id', teamIds)
          .order('created_at', { ascending: false })
        // Prefer a paid row per team; otherwise keep the newest (pending/failed).
        for (const pmt of teamPays ?? []) {
          if (!pmt.team_id) continue
          const prev = payByTeam.get(pmt.team_id)
          const paidish = pmt.status === 'paid' || pmt.status === 'manual'
          const prevPaidish = prev && (prev.status === 'paid' || prev.status === 'manual')
          if (!prev || (paidish && !prevPaidish)) payByTeam.set(pmt.team_id, pmt)
        }
      }
      for (const t of teams ?? []) {
        const league = perTeamLeagues.get(t.league_id)
        if (!league) continue
        const pmt = payByTeam.get(t.id)
        teamLedgerRows.push({
          id: `team-${t.id}`,
          created_at: pmt?.paid_at ?? t.created_at,
          teamId: t.id,
          teamName: t.name,
          league,
          payment: pmt ? { ...pmt, discountCode: null, discountCents: 0 } : null,
        })
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
    let paymentStatus: string
    if (isFree) paymentStatus = 'free'
    else if (payment?.status === 'paid' || payment?.status === 'manual') paymentStatus = 'paid'
    else if (payment?.status === 'pending') paymentStatus = 'pending'
    else if (payment?.status === 'failed') paymentStatus = 'failed'
    else if (payment?.status === 'refunded') paymentStatus = 'refunded'
    else paymentStatus = 'unpaid'

    return { ...r, player: player ?? null, league: league ?? null, payment: payment ?? null, paymentStatus, isFree }
  })
    // Per-team leagues: members owe nothing individually — the team row carries
    // the fee. Keep a member row only when it has a payment of its own.
    .filter(r => !(r.league?.payment_mode === 'per_team' && (r.league?.price_cents ?? 0) > 0 && !r.payment))

  const teamRows = teamLedgerRows.map(t => {
    const status = t.payment?.status
    const paymentStatus =
      status === 'paid' || status === 'manual' ? 'paid'
      : status === 'pending' ? 'pending'
      : status === 'failed' ? 'failed'
      : status === 'refunded' ? 'refunded'
      : 'unpaid'
    return {
      id: t.id,
      created_at: t.created_at,
      registration_type: null,
      guest_name: null,
      guest_email: null,
      player: null,
      teamId: t.teamId,
      teamName: t.teamName,
      league: t.league,
      payment: t.payment,
      paymentStatus,
      isFree: false,
    }
  })

  const ledger = [...registrations, ...teamRows]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Payments</h1>
      <PaymentsTable rows={ledger} isOrgAdmin={scope.isOrgAdmin} />
    </div>
  )
}
