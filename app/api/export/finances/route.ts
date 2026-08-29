import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { canAccess } from '@/lib/features'
import { toCsvBytes } from '@/lib/export/csv-helpers'

const TYPES = ['payments', 'expenses', 'overhead', 'other_income', 'merch'] as const
type ExportType = (typeof TYPES)[number]

const dollars = (cents: number | null | undefined) => ((cents ?? 0) / 100).toFixed(2)

/**
 * CSV export of the financial ledgers for a date range — the raw rows behind
 * the financial report. Same date semantics as the report: payments by
 * paid_at (fallback created_at), expenses/overhead by incurred_on, other
 * income by received_on, merch orders by created_at.
 */
export async function GET(req: NextRequest) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: member } = await db
    .from('org_members').select('role')
    .eq('organization_id', org.id).eq('user_id', user.id).single()
  if (!member || member.role !== 'org_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!(await canAccess(org.id, 'financial_tools'))) {
    return NextResponse.json({ error: 'Financial tools not available on this plan' }, { status: 403 })
  }

  const url = new URL(req.url)
  const type = url.searchParams.get('type') as ExportType | null
  const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (!type || !TYPES.includes(type) || !isDate(from) || !isDate(to)) {
    return NextResponse.json({ error: 'Invalid type or date range' }, { status: 400 })
  }
  const fromTs = `${from}T00:00:00.000Z`
  const toTs = `${to}T23:59:59.999Z`
  const inDateRange = (d: string | null | undefined, fallback?: string | null) => {
    const v = d ?? fallback ?? null
    if (!v) return false
    return v >= (v.length === 10 ? from! : fromTs) && v <= (v.length === 10 ? to! : toTs)
  }

  const { data: leagues } = await db.from('leagues').select('id, name').eq('organization_id', org.id)
  const leagueName = new Map((leagues ?? []).map((l) => [l.id, l.name]))
  const eventOf = (leagueId: string | null) => (leagueId ? leagueName.get(leagueId) ?? 'Deleted event' : 'Shop / org-wide')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = []
  let columns: string[] = []

  if (type === 'payments') {
    const [{ data }, { data: teams }] = await Promise.all([
      db.from('payments')
        .select('amount_cents, tax_cents, refunded_cents, refunded_at, status, payment_method, payment_type, paid_at, created_at, notes, league_id, team_id, registration_id, payer:profiles!payments_user_id_fkey(full_name, email), registration:registrations!payments_registration_id_fkey(guest_name)')
        .eq('organization_id', org.id).in('status', ['paid', 'manual', 'refunded']),
      db.from('teams').select('id, name').eq('organization_id', org.id),
    ])
    const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name]))
    const seenTeams = new Set<string>()
    columns = ['date', 'event', 'payer', 'type', 'method', 'status', 'amount', 'tax_included', 'refunded', 'refund_date', 'counted_in_report', 'notes']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows = ((data ?? []) as any[])
      .filter((p) => inDateRange(p.paid_at, p.created_at) || ((p.refunded_cents ?? 0) > 0 && inDateRange(p.refunded_at)))
      .map((p) => {
        const payer = Array.isArray(p.payer) ? p.payer[0] : p.payer
        const reg = Array.isArray(p.registration) ? p.registration[0] : p.registration
        // Mirror the report's counting rules so the CSV reconciles to it:
        // team fees count once per team, deleted-registration orphans not at all.
        let counted = 'yes'
        if (p.payment_type === 'team' && p.team_id) {
          const key = `${p.league_id}:${p.team_id}`
          if (seenTeams.has(key)) counted = 'no (duplicate team fee row)'
          else seenTeams.add(key)
        } else if (!p.registration_id) counted = 'no (registration removed)'
        return {
          date: (p.paid_at ?? p.created_at ?? '').slice(0, 10),
          event: eventOf(p.league_id),
          payer: p.payment_type === 'team' && p.team_id
            ? `${teamNameById.get(p.team_id) ?? 'Deleted team'} (team)`
            : payer?.full_name ?? reg?.guest_name ?? '—',
          type: p.payment_type ?? 'player',
          method: p.payment_method ?? '',
          status: p.status,
          amount: dollars(p.amount_cents),
          tax_included: dollars(p.tax_cents),
          refunded: (p.refunded_cents ?? 0) > 0 ? dollars(p.refunded_cents) : '',
          refund_date: p.refunded_at ? p.refunded_at.slice(0, 10) : '',
          counted_in_report: counted,
          notes: p.notes ?? '',
        }
      })
  } else if (type === 'expenses') {
    const { data } = await db.from('event_expenses')
      .select('league_id, category, description, vendor, amount_cents, incurred_on, created_at, notes, receipt_path')
      .eq('organization_id', org.id)
    columns = ['date', 'event', 'category', 'description', 'vendor', 'amount', 'receipt', 'notes']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows = ((data ?? []) as any[])
      .filter((r) => inDateRange(r.incurred_on, r.created_at))
      .map((r) => ({
        date: r.incurred_on ?? (r.created_at ?? '').slice(0, 10),
        event: eventOf(r.league_id),
        category: r.category,
        description: r.description,
        vendor: r.vendor ?? '',
        amount: dollars(r.amount_cents),
        receipt: r.receipt_path ? 'yes' : '',
        notes: r.notes ?? '',
      }))
  } else if (type === 'overhead') {
    const { data } = await db.from('org_overhead_expenses')
      .select('category, description, amount_cents, period, applies_to, incurred_on, created_at, notes, receipt_path')
      .eq('organization_id', org.id)
    columns = ['date', 'category', 'description', 'period', 'applies_to', 'amount', 'receipt', 'notes']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows = ((data ?? []) as any[])
      .filter((r) => inDateRange(r.incurred_on, r.created_at))
      .map((r) => ({
        date: r.incurred_on ?? (r.created_at ?? '').slice(0, 10),
        category: r.category,
        description: r.description,
        period: r.period,
        applies_to: r.applies_to,
        amount: dollars(r.amount_cents),
        receipt: r.receipt_path ? 'yes' : '',
        notes: r.notes ?? '',
      }))
  } else if (type === 'other_income') {
    const { data } = await db.from('event_revenue')
      .select('league_id, category, description, source, amount_cents, received_on, created_at, notes')
      .eq('organization_id', org.id)
    columns = ['date', 'event', 'category', 'description', 'source', 'amount', 'notes']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows = ((data ?? []) as any[])
      .filter((r) => inDateRange(r.received_on, r.created_at))
      .map((r) => ({
        date: r.received_on ?? (r.created_at ?? '').slice(0, 10),
        event: eventOf(r.league_id),
        category: r.category,
        description: r.description,
        source: r.source ?? '',
        amount: dollars(r.amount_cents),
        notes: r.notes ?? '',
      }))
  } else {
    // merch
    const { data } = await db.from('merchandise_orders')
      .select('league_id, quantity, unit_price_cents, discount_cents, amount_paid_cents, status, created_at, item:merchandise_items!merchandise_orders_item_id_fkey(name), variant:merchandise_variants!merchandise_orders_variant_id_fkey(label)')
      .eq('organization_id', org.id).in('status', ['paid', 'fulfilled'])
    columns = ['date', 'event', 'item', 'variant', 'quantity', 'unit_price', 'discount', 'amount_paid', 'status']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows = ((data ?? []) as any[])
      .filter((r) => inDateRange(r.created_at))
      .map((r) => {
        const item = Array.isArray(r.item) ? r.item[0] : r.item
        const variant = Array.isArray(r.variant) ? r.variant[0] : r.variant
        return {
          date: (r.created_at ?? '').slice(0, 10),
          event: eventOf(r.league_id),
          item: item?.name ?? '—',
          variant: variant?.label ?? '',
          quantity: r.quantity,
          unit_price: dollars(r.unit_price_cents),
          discount: dollars(r.discount_cents),
          amount_paid: dollars(r.amount_paid_cents ?? (r.unit_price_cents * r.quantity - (r.discount_cents ?? 0))),
          status: r.status,
        }
      })
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const body = toCsvBytes(rows, columns)
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fieldday-${type}-${from}-to-${to}.csv"`,
    },
  })
}
