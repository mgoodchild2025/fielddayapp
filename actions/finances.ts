'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { EXPENSE_CATEGORIES, type ExpenseCategory, OVERHEAD_CATEGORIES, type OverheadCategory, OVERHEAD_PERIODS, type OverheadPeriod, BUDGET_COST_TYPES, type BudgetCostType, REVENUE_CATEGORIES, type RevenueCategory } from '@/lib/finance-constants'

// ── Auth helper ──────────────────────────────────────────────────────────────

async function requireFinanceAdmin(orgId: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()
  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Unauthorized' }
  }
  return { userId: user.id }
}

/** Variant cost overrides item cost; null at both levels = untracked. */
function unitCogs(
  variantId: string | null,
  itemCost: number | null | undefined,
  variantCost: Map<string, number | null>,
): number | null {
  const v = variantId ? variantCost.get(variantId) : null
  return (v ?? itemCost) ?? null
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ShopPnlItem = {
  itemId: string
  name: string
  unitsSold: number
  revenueCents: number
  /** Total COGS for the units sold. null when the item has no cost on record. */
  costCents: number | null
  /** Profit = revenue − cost. null when cost is untracked. */
  profitCents: number | null
  /** Margin as a fraction (0–1). null when cost is untracked or revenue is 0. */
  margin: number | null
  costTracked: boolean
}

export type ShopPnl = {
  revenueCents: number
  /** COGS across items that have a cost on record. */
  cogsCents: number
  /** Profit on the cost-tracked portion (revenue of tracked items − their COGS). */
  profitCents: number
  /** Margin on the cost-tracked portion (0–1), or null when there's nothing tracked. */
  margin: number | null
  /** Number of distinct sold items missing a cost (their profit can't be computed). */
  untrackedItemCount: number
  orderCount: number
  items: ShopPnlItem[]
}

// ── Shop profit & loss ───────────────────────────────────────────────────────

/**
 * Profit/loss for the standalone shop (orders with league_id IS NULL).
 * Revenue counts paid + fulfilled orders, honouring amount_paid_cents overrides
 * and discounts. COGS uses variant cost where set, else the item cost; items
 * with no cost on record are surfaced separately rather than assumed free.
 */
export async function getShopPnl(orgId: string): Promise<ShopPnl> {
  const db = createServiceRoleClient()


  const { data: orders } = await db
    .from('merchandise_orders')
    .select('item_id, variant_id, quantity, unit_price_cents, discount_cents, amount_paid_cents')
    .eq('organization_id', orgId)
    .is('league_id', null)
    .in('status', ['paid', 'fulfilled'])

  const typedOrders = (orders ?? []) as {
    item_id: string
    variant_id: string | null
    quantity: number
    unit_price_cents: number
    discount_cents: number | null
    amount_paid_cents: number | null
  }[]

  const empty: ShopPnl = {
    revenueCents: 0, cogsCents: 0, profitCents: 0, margin: null,
    untrackedItemCount: 0, orderCount: 0, items: [],
  }
  if (typedOrders.length === 0) return empty

  const itemIds = [...new Set(typedOrders.map((o) => o.item_id))]
  const variantIds = [...new Set(typedOrders.map((o) => o.variant_id).filter(Boolean) as string[])]


  const [{ data: items }, { data: variants }] = await Promise.all([

    db.from('merchandise_items').select('id, name, cost_cents').in('id', itemIds),
    variantIds.length > 0

      ? db.from('merchandise_variants').select('id, cost_cents').in('id', variantIds)
      : Promise.resolve({ data: [] }),
  ])

  const itemMeta = new Map<string, { name: string; cost: number | null }>()
  for (const i of (items ?? []) as { id: string; name: string; cost_cents: number | null }[]) {
    itemMeta.set(i.id, { name: i.name, cost: i.cost_cents })
  }
  const variantCost = new Map<string, number | null>()
  for (const v of (variants ?? []) as { id: string; cost_cents: number | null }[]) {
    variantCost.set(v.id, v.cost_cents)
  }

  // Aggregate per item
  type Agg = { name: string; units: number; revenue: number; cost: number; allTracked: boolean }
  const byItem = new Map<string, Agg>()

  for (const o of typedOrders) {
    const meta = itemMeta.get(o.item_id)
    const name = meta?.name ?? 'Unknown item'
    const lineRevenue = o.amount_paid_cents ?? (o.unit_price_cents * o.quantity - (o.discount_cents ?? 0))

    // Variant cost overrides item cost; null at both levels = untracked.
    const unitCost = (o.variant_id ? variantCost.get(o.variant_id) : null) ?? meta?.cost ?? null
    const tracked = unitCost !== null && unitCost !== undefined

    const agg = byItem.get(o.item_id) ?? { name, units: 0, revenue: 0, cost: 0, allTracked: true }
    agg.units += o.quantity
    agg.revenue += lineRevenue
    if (tracked) agg.cost += unitCost! * o.quantity
    else agg.allTracked = false
    byItem.set(o.item_id, agg)
  }

  const items_: ShopPnlItem[] = [...byItem.entries()].map(([itemId, a]) => {
    const costCents = a.allTracked ? a.cost : null
    const profitCents = costCents !== null ? a.revenue - costCents : null
    const margin = profitCents !== null && a.revenue > 0 ? profitCents / a.revenue : null
    return {
      itemId, name: a.name, unitsSold: a.units, revenueCents: a.revenue,
      costCents, profitCents, margin, costTracked: a.allTracked,
    }
  }).sort((x, y) => y.revenueCents - x.revenueCents)

  const revenueCents = items_.reduce((s, i) => s + i.revenueCents, 0)
  // Profit/margin reported on the cost-tracked portion only, so untracked items
  // don't masquerade as 100% margin.
  const trackedRevenue = items_.filter((i) => i.costTracked).reduce((s, i) => s + i.revenueCents, 0)
  const cogsCents = items_.reduce((s, i) => s + (i.costCents ?? 0), 0)
  const profitCents = trackedRevenue - cogsCents
  const margin = trackedRevenue > 0 ? profitCents / trackedRevenue : null
  const untrackedItemCount = items_.filter((i) => !i.costTracked).length

  return {
    revenueCents,
    cogsCents,
    profitCents,
    margin,
    untrackedItemCount,
    orderCount: typedOrders.length,
    items: items_,
  }
}

// ── Event expenses ───────────────────────────────────────────────────────────

export type EventExpense = {
  id: string
  league_id: string
  session_id: string | null
  category: ExpenseCategory
  description: string
  amount_cents: number
  vendor: string | null
  incurred_on: string | null
  notes: string | null
  receipt_path: string | null
  created_at: string
}

export async function getEventExpenses(leagueId: string): Promise<EventExpense[]> {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('event_expenses')
    .select('id, league_id, session_id, category, description, amount_cents, vendor, incurred_on, notes, receipt_path, created_at')
    .eq('league_id', leagueId)
    .order('incurred_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as EventExpense[]
}

export async function addEventExpense(input: {
  leagueId: string
  category: ExpenseCategory
  description: string
  amountCents: number
  vendor?: string
  incurredOn?: string | null
  notes?: string
  sessionId?: string | null
}): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  if (!input.description.trim()) return { error: 'Description is required.' }
  if (!Number.isFinite(input.amountCents) || input.amountCents < 0) return { error: 'Enter a valid amount.' }
  if (!EXPENSE_CATEGORIES.includes(input.category)) return { error: 'Invalid category.' }

  // Verify the league belongs to this org before writing.
  const db = createServiceRoleClient()

  const { data: league } = await db
    .from('leagues').select('id').eq('id', input.leagueId).eq('organization_id', org.id).single()
  if (!league) return { error: 'Event not found.' }

  // If tagging a session, verify it belongs to this event.
  if (input.sessionId) {

    const { data: sess } = await db
      .from('event_sessions').select('id').eq('id', input.sessionId).eq('league_id', input.leagueId).maybeSingle()
    if (!sess) return { error: 'Session not found for this event.' }
  }


  const { error } = await db.from('event_expenses').insert({
    organization_id: org.id,
    league_id: input.leagueId,
    session_id: input.sessionId || null,
    category: input.category,
    description: input.description.trim(),
    amount_cents: Math.round(input.amountCents),
    vendor: input.vendor?.trim() || null,
    incurred_on: input.incurredOn || null,
    notes: input.notes?.trim() || null,
    created_by: auth.userId,
  })
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${input.leagueId}/finances`)
  return { error: null }
}

/**
 * Logs the same per-session cost against every session of an event — one expense
 * row per session, each tagged to its session. The amount is per session, so the
 * total recorded is amount × session count.
 */
export async function addEventExpensePerSession(input: {
  leagueId: string
  category: ExpenseCategory
  description: string
  amountCents: number
  vendor?: string
}): Promise<{ error: string | null; count?: number }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  if (!input.description.trim()) return { error: 'Description is required.' }
  if (!Number.isFinite(input.amountCents) || input.amountCents < 0) return { error: 'Enter a valid amount.' }
  if (!EXPENSE_CATEGORIES.includes(input.category)) return { error: 'Invalid category.' }

  const db = createServiceRoleClient()

  const { data: league } = await db
    .from('leagues').select('id').eq('id', input.leagueId).eq('organization_id', org.id).single()
  if (!league) return { error: 'Event not found.' }


  const { data: sessions } = await db
    .from('event_sessions').select('id, scheduled_at')
    .eq('league_id', input.leagueId).eq('organization_id', org.id)
  if (!sessions || sessions.length === 0) return { error: 'This event has no sessions yet.' }

  const rows = sessions.map((s: { id: string; scheduled_at: string }) => ({
    organization_id: org.id,
    league_id: input.leagueId,
    session_id: s.id,
    category: input.category,
    description: input.description.trim(),
    amount_cents: Math.round(input.amountCents),
    vendor: input.vendor?.trim() || null,
    // Date the cost to the session it covers.
    incurred_on: s.scheduled_at ? s.scheduled_at.slice(0, 10) : null,
    created_by: auth.userId,
  }))


  const { error } = await db.from('event_expenses').insert(rows)
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${input.leagueId}/finances`)
  return { error: null, count: rows.length }
}

export async function deleteEventExpense(expenseId: string, leagueId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  const db = createServiceRoleClient()

  const { error } = await db
    .from('event_expenses').delete().eq('id', expenseId).eq('organization_id', org.id)
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/finances`)
  return { error: null }
}

// ── Period financial report (date-ranged, for tax filing) ────────────────────

export type FinancialReport = {
  fromDate: string
  toDate: string
  registrationRevenueCents: number
  /** Sales tax included in the registration revenue above — the remittance figure. */
  taxCollectedCents: number
  /** Refunds issued within the period (dated by refunded_at; already subtracted from revenueCents). */
  refundedCents: number
  merchRevenueCents: number
  merchCogsCents: number
  otherIncomeByCategory: { category: string; amountCents: number }[]
  otherIncomeCents: number
  expensesByCategory: { category: string; amountCents: number }[]
  eventExpenseCents: number
  overheadByCategory: { category: string; amountCents: number }[]
  overheadCents: number
  revenueCents: number
  costCents: number
  profitCents: number
  /** Per-event revenue vs direct costs within the period (shop = null league). */
  events: { leagueId: string | null; name: string; revenueCents: number; costCents: number }[]
}

/**
 * Org-wide financials for a date range. Which date counts: payments by paid_at
 * (falling back to created_at), expenses/overhead by incurred_on, other income
 * by received_on, merch orders by created_at — accrual-ish, so a rental logged
 * against last year lands in last year's report. Registration revenue follows
 * the P&L rules (team fees once per team, deleted-registration orphans excluded).
 */
export async function getFinancialReport(orgId: string, fromDate: string, toDate: string): Promise<FinancialReport> {
  const db = createServiceRoleClient()
  const fromTs = `${fromDate}T00:00:00.000Z`
  const toTs = `${toDate}T23:59:59.999Z`
  const inDateRange = (d: string | null | undefined, fallback?: string | null) => {
    const v = d ?? fallback ?? null
    if (!v) return false
    return v >= (v.length === 10 ? fromDate : fromTs) && v <= (v.length === 10 ? toDate : toTs)
  }

  const [{ data: payments }, { data: merchOrders }, { data: expenses }, { data: overhead }, { data: otherRevenue }, { data: leagues }] = await Promise.all([

    db.from('payments')
      .select('amount_cents, tax_cents, refunded_cents, refunded_at, league_id, payment_type, team_id, registration_id, paid_at, created_at')
      .eq('organization_id', orgId).in('status', ['paid', 'manual', 'refunded']),

    db.from('merchandise_orders')
      .select('league_id, item_id, variant_id, quantity, unit_price_cents, discount_cents, amount_paid_cents, created_at')
      .eq('organization_id', orgId).in('status', ['paid', 'fulfilled']),

    db.from('event_expenses').select('league_id, category, amount_cents, incurred_on, created_at').eq('organization_id', orgId),

    db.from('org_overhead_expenses').select('category, amount_cents, incurred_on, created_at').eq('organization_id', orgId),

    db.from('event_revenue').select('league_id, category, amount_cents, received_on, created_at').eq('organization_id', orgId),

    db.from('leagues').select('id, name').eq('organization_id', orgId),
  ])

  const leagueName = new Map<string, string>()
  for (const l of (leagues ?? []) as { id: string; name: string }[]) leagueName.set(l.id, l.name)
  const revByKey = new Map<string, number>()
  const costByKey = new Map<string, number>()
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

  // Registration revenue + tax — same counting rules as the P&L. Refunds are
  // dated by refunded_at, so a January refund of a December payment lands in
  // January's report, not December's.
  let registrationRevenueCents = 0
  let taxCollectedCents = 0
  let refundedCents = 0
  const seenTeams = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (payments ?? []) as any[]) {
    const teamKey = p.payment_type === 'team' && p.team_id ? `${p.league_id}:${p.team_id}` : null
    if (teamKey) {
      if (seenTeams.has(teamKey)) continue
      seenTeams.add(teamKey)
    } else if (!p.registration_id) continue
    if ((p.refunded_cents ?? 0) > 0 && inDateRange(p.refunded_at)) {
      refundedCents += p.refunded_cents ?? 0
      add(revByKey, p.league_id ?? '', -(p.refunded_cents ?? 0))
    }
    if (!inDateRange(p.paid_at, p.created_at)) continue
    registrationRevenueCents += p.amount_cents ?? 0
    taxCollectedCents += p.tax_cents ?? 0
    add(revByKey, p.league_id ?? '', p.amount_cents ?? 0)
  }

  // Merch revenue + COGS within range
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = ((merchOrders ?? []) as any[]).filter((o) => inDateRange(o.created_at))
  let merchRevenueCents = 0
  let merchCogsCents = 0
  if (orders.length > 0) {
    const itemIds = [...new Set(orders.map((o) => o.item_id as string))]
    const variantIds = [...new Set(orders.map((o) => o.variant_id).filter(Boolean) as string[])]
    const [{ data: items }, { data: variants }] = await Promise.all([
      db.from('merchandise_items').select('id, cost_cents').in('id', itemIds),
      variantIds.length > 0
        ? db.from('merchandise_variants').select('id, cost_cents').in('id', variantIds)
        : Promise.resolve({ data: [] }),
    ])
    const itemCost = new Map<string, number | null>()
    for (const i of (items ?? []) as { id: string; cost_cents: number | null }[]) itemCost.set(i.id, i.cost_cents)
    const variantCost = new Map<string, number | null>()
    for (const v of (variants ?? []) as { id: string; cost_cents: number | null }[]) variantCost.set(v.id, v.cost_cents)
    for (const o of orders) {
      const rev = o.amount_paid_cents ?? (o.unit_price_cents * o.quantity - (o.discount_cents ?? 0))
      merchRevenueCents += rev
      add(revByKey, o.league_id ?? '', rev)
      const unit = unitCogs(o.variant_id, itemCost.get(o.item_id), variantCost)
      if (unit !== null) {
        merchCogsCents += unit * o.quantity
        add(costByKey, o.league_id ?? '', unit * o.quantity)
      }
    }
  }

  const byCategory = (rows: { category: string; amountCents: number }[]) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + r.amountCents)
    return [...m.entries()].map(([category, amountCents]) => ({ category, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incomeRows = ((otherRevenue ?? []) as any[]).filter((r) => inDateRange(r.received_on, r.created_at))
  const otherIncomeByCategory = byCategory(incomeRows.map((r) => ({ category: r.category as string, amountCents: r.amount_cents as number })))
  const otherIncomeCents = incomeRows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0)
  for (const r of incomeRows) add(revByKey, r.league_id ?? '', r.amount_cents ?? 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenseRows = ((expenses ?? []) as any[]).filter((r) => inDateRange(r.incurred_on, r.created_at))
  const expensesByCategory = byCategory(expenseRows.map((r) => ({ category: r.category as string, amountCents: r.amount_cents as number })))
  const eventExpenseCents = expenseRows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0)
  for (const r of expenseRows) add(costByKey, r.league_id ?? '', r.amount_cents ?? 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overheadRows = ((overhead ?? []) as any[]).filter((r) => inDateRange(r.incurred_on, r.created_at))
  const overheadByCategory = byCategory(overheadRows.map((r) => ({ category: r.category as string, amountCents: r.amount_cents as number })))
  const overheadCents = overheadRows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0)

  const revenueCents = registrationRevenueCents + merchRevenueCents + otherIncomeCents - refundedCents
  const costCents = eventExpenseCents + overheadCents + merchCogsCents
  const events = [...new Set([...revByKey.keys(), ...costByKey.keys()])]
    .map((k) => ({
      leagueId: k || null,
      name: k ? (leagueName.get(k) ?? 'Deleted event') : 'Shop / org-wide',
      revenueCents: revByKey.get(k) ?? 0,
      costCents: costByKey.get(k) ?? 0,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents)

  return {
    fromDate, toDate,
    registrationRevenueCents, taxCollectedCents, refundedCents,
    merchRevenueCents, merchCogsCents,
    otherIncomeByCategory, otherIncomeCents,
    expensesByCategory, eventExpenseCents,
    overheadByCategory, overheadCents,
    revenueCents, costCents, profitCents: revenueCents - costCents,
    events,
  }
}

// ── Per-event profit & loss ──────────────────────────────────────────────────

export type EventPnl = {
  registrationRevenueCents: number
  /** Refunds issued against this event's payments (already subtracted from revenueCents). */
  refundedCents: number
  merchRevenueCents: number
  otherRevenueCents: number
  merchCogsCents: number
  expenseCents: number
  /** This event's share of org overhead (facility rental, etc.). */
  allocatedOverheadCents: number
  /** Total revenue = registrations + event merch + other income. */
  revenueCents: number
  /** Total costs = logged expenses + merch COGS. */
  costCents: number
  profitCents: number
  marginPct: number | null
  expenseCount: number
}

/**
 * Profit/loss for a single event = (registration payments + event merch revenue)
 * − (logged expenses + merch COGS). Registration revenue counts paid + manual
 * payments; merch counts paid + fulfilled orders (honouring amount_paid + discounts).
 */
export async function getEventPnl(leagueId: string, orgId: string): Promise<EventPnl> {
  const db = createServiceRoleClient()

  const [{ data: payments }, { data: merchOrders }, { data: expenses }, { data: otherRevenue }] = await Promise.all([

    db.from('payments')
      .select('amount_cents, refunded_cents, status, payment_type, team_id, registration_id')
      .eq('organization_id', orgId).eq('league_id', leagueId).in('status', ['paid', 'manual', 'refunded']),

    db.from('merchandise_orders')
      .select('item_id, variant_id, quantity, unit_price_cents, discount_cents, amount_paid_cents')
      .eq('organization_id', orgId).eq('league_id', leagueId).in('status', ['paid', 'fulfilled']),

    db.from('event_expenses').select('amount_cents').eq('league_id', leagueId),

    db.from('event_revenue').select('amount_cents').eq('league_id', leagueId),
  ])

  const { data: allocRows } = await db
    .from('org_overhead_allocations')
    .select('amount_cents')
    .eq('organization_id', orgId)
    .eq('league_id', leagueId)
  const allocatedOverheadCents = ((allocRows ?? []) as { amount_cents: number }[])
    .reduce((sum, a) => sum + (a.amount_cents ?? 0), 0)

  // A team owes its fee once — the mark-as-paid duplicate bug left some teams
  // with several identical paid rows, so team payments count once per team.
  // Per-player rows whose registration was deleted (admin removal detaches
  // them to registration_id null) no longer represent money owed for this
  // event and are excluded.
  const paidRows = (payments ?? []) as { amount_cents: number; refunded_cents: number | null; payment_type: string | null; team_id: string | null; registration_id: string | null }[]
  const seenTeams = new Set<string>()
  let registrationRevenueCents = 0
  let refundedCents = 0
  for (const p of paidRows) {
    if (p.payment_type === 'team' && p.team_id) {
      if (seenTeams.has(p.team_id)) continue
      seenTeams.add(p.team_id)
    } else if (!p.registration_id) continue
    registrationRevenueCents += p.amount_cents ?? 0
    refundedCents += p.refunded_cents ?? 0
  }

  const otherRevenueCents = ((otherRevenue ?? []) as { amount_cents: number }[])
    .reduce((s, r) => s + (r.amount_cents ?? 0), 0)

  const orders = (merchOrders ?? []) as {
    item_id: string; variant_id: string | null; quantity: number
    unit_price_cents: number; discount_cents: number | null; amount_paid_cents: number | null
  }[]

  let merchRevenueCents = 0
  let merchCogsCents = 0
  if (orders.length > 0) {
    const itemIds = [...new Set(orders.map((o) => o.item_id))]
    const variantIds = [...new Set(orders.map((o) => o.variant_id).filter(Boolean) as string[])]
    const [{ data: items }, { data: variants }] = await Promise.all([

      db.from('merchandise_items').select('id, cost_cents').in('id', itemIds),
      variantIds.length > 0

        ? db.from('merchandise_variants').select('id, cost_cents').in('id', variantIds)
        : Promise.resolve({ data: [] }),
    ])
    const itemCost = new Map<string, number | null>()
    for (const i of (items ?? []) as { id: string; cost_cents: number | null }[]) itemCost.set(i.id, i.cost_cents)
    const variantCost = new Map<string, number | null>()
    for (const v of (variants ?? []) as { id: string; cost_cents: number | null }[]) variantCost.set(v.id, v.cost_cents)

    for (const o of orders) {
      merchRevenueCents += o.amount_paid_cents ?? (o.unit_price_cents * o.quantity - (o.discount_cents ?? 0))
      const unit = unitCogs(o.variant_id, itemCost.get(o.item_id), variantCost)
      if (unit !== null) merchCogsCents += unit * o.quantity
    }
  }

  const expenseRows = (expenses ?? []) as { amount_cents: number }[]
  const expenseCents = expenseRows.reduce((s, e) => s + (e.amount_cents ?? 0), 0)

  // Revenue is gross; refunds subtract on their own line.
  const revenueCents = registrationRevenueCents + merchRevenueCents + otherRevenueCents - refundedCents
  const costCents = expenseCents + merchCogsCents + allocatedOverheadCents
  const profitCents = revenueCents - costCents
  const marginPct = revenueCents > 0 ? profitCents / revenueCents : null

  return {
    registrationRevenueCents, refundedCents, merchRevenueCents, otherRevenueCents, merchCogsCents,
    allocatedOverheadCents,
    expenseCents, revenueCents, costCents, profitCents, marginPct,
    expenseCount: expenseRows.length,
  }
}

// ── Org overhead ─────────────────────────────────────────────────────────────

// ── Per-session registration revenue (drop-in / pickup events) ───────────────

export type SessionRevenueRow = {
  /** null = league-level payments (season passes). */
  sessionId: string | null
  amountCents: number
  paymentCount: number
}

/** Paid/manual registration revenue grouped by the paying registration's
 *  session. Deleted-registration orphans are excluded, same as getEventPnl. */
export async function getEventRevenueBySession(leagueId: string, orgId: string): Promise<SessionRevenueRow[]> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('payments')
    .select('amount_cents, refunded_cents, registration_id, payment_type, registration:registrations!payments_registration_id_fkey(session_id)')
    .eq('organization_id', orgId)
    .eq('league_id', leagueId)
    .in('status', ['paid', 'manual', 'refunded'])
  const bySession = new Map<string | null, { amountCents: number; paymentCount: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (data ?? []) as any[]) {
    if (!p.registration_id && p.payment_type !== 'team') continue
    const reg = Array.isArray(p.registration) ? p.registration[0] : p.registration
    const key = (reg?.session_id ?? null) as string | null
    const agg = bySession.get(key) ?? { amountCents: 0, paymentCount: 0 }
    agg.amountCents += (p.amount_cents ?? 0) - (p.refunded_cents ?? 0)
    agg.paymentCount += 1
    bySession.set(key, agg)
  }
  return [...bySession.entries()].map(([sessionId, a]) => ({ sessionId, ...a }))
}

export type OrgOverhead = {
  id: string
  category: OverheadCategory
  description: string
  amount_cents: number
  period: OverheadPeriod
  applies_to: 'general' | 'shop'
  incurred_on: string | null
  notes: string | null
  receipt_path: string | null
  created_at: string
  /** Portions attributed to specific events; the remainder is pure overhead. */
  allocations?: OverheadAllocation[]
}

export async function getOrgOverhead(orgId: string): Promise<OrgOverhead[]> {
  const db = createServiceRoleClient()

  const [{ data }, { data: allocRows }] = await Promise.all([
    db.from('org_overhead_expenses')
      .select('id, category, description, amount_cents, period, applies_to, incurred_on, notes, receipt_path, created_at')
      .eq('organization_id', orgId)
      .order('incurred_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    db.from('org_overhead_allocations')
      .select('overhead_id, league_id, amount_cents, league:leagues!org_overhead_allocations_league_id_fkey(name)')
      .eq('organization_id', orgId),
  ])
  const allocsByOverhead = new Map<string, OverheadAllocation[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (allocRows ?? []) as any[]) {
    const league = Array.isArray(a.league) ? a.league[0] : a.league
    const list = allocsByOverhead.get(a.overhead_id) ?? []
    list.push({ leagueId: a.league_id, leagueName: league?.name ?? 'Deleted event', amountCents: a.amount_cents })
    allocsByOverhead.set(a.overhead_id, list)
  }
  return ((data ?? []) as OrgOverhead[]).map((e) => ({ ...e, allocations: allocsByOverhead.get(e.id) ?? [] }))
}

// ── Overhead allocation: attribute a shared cost to specific events ──────────

export type OverheadAllocation = { leagueId: string; leagueName: string; amountCents: number }

export type AllocationTarget = { leagueId: string; name: string; status: string; sessionCount: number }

/** Events an overhead cost can be allocated to, with session counts for the
 *  "split by sessions" helper. */
export async function getAllocationTargets(orgId: string): Promise<AllocationTarget[]> {
  const db = createServiceRoleClient()
  const [{ data: leagues }, { data: sessions }] = await Promise.all([
    db.from('leagues')
      .select('id, name, status')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .not('status', 'in', '(archived)')
      .order('created_at', { ascending: false }),
    db.from('event_sessions').select('league_id').eq('organization_id', orgId).neq('status', 'cancelled'),
  ])
  const sessionCount = new Map<string, number>()
  for (const sRow of (sessions ?? []) as { league_id: string }[]) {
    sessionCount.set(sRow.league_id, (sessionCount.get(sRow.league_id) ?? 0) + 1)
  }
  return ((leagues ?? []) as { id: string; name: string; status: string }[]).map((l) => ({
    leagueId: l.id, name: l.name, status: l.status, sessionCount: sessionCount.get(l.id) ?? 0,
  }))
}

/** Replace an overhead expense's event allocations. The sum may not exceed the
 *  expense amount; the remainder stays unallocated org overhead. */
export async function saveOverheadAllocations(input: {
  overheadId: string
  allocations: { leagueId: string; amountCents: number }[]
}): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  const db = createServiceRoleClient()
  const { data: expense } = await db
    .from('org_overhead_expenses')
    .select('id, amount_cents')
    .eq('id', input.overheadId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!expense) return { error: 'Overhead expense not found' }

  const rows = input.allocations.filter((a) => a.amountCents > 0)
  for (const a of rows) {
    if (!Number.isInteger(a.amountCents) || a.amountCents <= 0) return { error: 'Enter valid amounts.' }
  }
  if (new Set(rows.map((a) => a.leagueId)).size !== rows.length) return { error: 'Duplicate event in allocation.' }
  const total = rows.reduce((sum, a) => sum + a.amountCents, 0)
  if (total > expense.amount_cents) {
    return { error: 'Allocations exceed the expense amount.' }
  }

  // Replace-all: simplest correct semantics for an edit form.
  const { error: delError } = await db
    .from('org_overhead_allocations')
    .delete()
    .eq('overhead_id', expense.id)
    .eq('organization_id', org.id)
  if (delError) return { error: delError.message }
  if (rows.length > 0) {
    const { error: insError } = await db.from('org_overhead_allocations').insert(
      rows.map((a) => ({
        organization_id: org.id,
        overhead_id: expense.id,
        league_id: a.leagueId,
        amount_cents: a.amountCents,
      }))
    )
    if (insError) return { error: insError.message }
  }
  revalidatePath('/admin/finances')
  return { error: null }
}

export async function addOrgOverhead(input: {
  category: OverheadCategory
  description: string
  amountCents: number
  period: OverheadPeriod
  appliesTo: 'general' | 'shop'
  incurredOn?: string | null
  notes?: string
}): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  if (!input.description.trim()) return { error: 'Description is required.' }
  if (!Number.isFinite(input.amountCents) || input.amountCents < 0) return { error: 'Enter a valid amount.' }
  if (!OVERHEAD_CATEGORIES.includes(input.category)) return { error: 'Invalid category.' }
  if (!OVERHEAD_PERIODS.includes(input.period)) return { error: 'Invalid period.' }

  const db = createServiceRoleClient()

  const { error } = await db.from('org_overhead_expenses').insert({
    organization_id: org.id,
    category: input.category,
    description: input.description.trim(),
    amount_cents: Math.round(input.amountCents),
    period: input.period,
    applies_to: input.appliesTo,
    incurred_on: input.incurredOn || null,
    notes: input.notes?.trim() || null,
    created_by: auth.userId,
  })
  if (error) return { error: error.message }

  revalidatePath('/admin/finances')
  return { error: null }
}

// ── Fiscal year setting ───────────────────────────────────────────────────────

/** Set the org's fiscal year start month (1 = January = calendar year). */
export async function setFiscalYearStart(month: number): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: 'Invalid month' }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('org_branding')
    .update({ fiscal_year_start_month: month })
    .eq('organization_id', org.id)
  if (error) return { error: error.message }
  revalidatePath('/admin/finances')
  revalidatePath('/admin/settings/payments')
  return { error: null }
}

// ── Expense receipts (private bucket, signed-URL viewing) ─────────────────────

const RECEIPT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
}
const RECEIPT_MAX_SIZE = 10 * 1024 * 1024
const RECEIPT_TABLE = { event: 'event_expenses', overhead: 'org_overhead_expenses' } as const
export type ReceiptKind = keyof typeof RECEIPT_TABLE

/** Attach (or replace) the receipt on an expense / overhead entry. */
export async function uploadExpenseReceipt(formData: FormData): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  const kind = formData.get('kind') as ReceiptKind | null
  const expenseId = formData.get('expenseId') as string | null
  const file = formData.get('file') as File | null
  if (!kind || !(kind in RECEIPT_TABLE) || !expenseId) return { error: 'Invalid input' }
  if (!file || file.size === 0) return { error: 'No file provided' }
  const ext = RECEIPT_TYPES[file.type]
  if (!ext) return { error: 'Use a JPEG, PNG, WebP, or PDF.' }
  if (file.size > RECEIPT_MAX_SIZE) return { error: 'File too large (max 10 MB).' }

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from(RECEIPT_TABLE[kind])
    .select('id, receipt_path')
    .eq('id', expenseId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!row) return { error: 'Expense not found' }

  const path = `${org.id}/${kind}/${expenseId}.${ext}`
  const { error: uploadError } = await db.storage
    .from('expense-receipts')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) return { error: uploadError.message }
  // Replacing a receipt that had a different extension leaves the old object behind — remove it.
  if (row.receipt_path && row.receipt_path !== path) {
    await db.storage.from('expense-receipts').remove([row.receipt_path])
  }
  const { error } = await db.from(RECEIPT_TABLE[kind])
    .update({ receipt_path: path })
    .eq('id', expenseId)
    .eq('organization_id', org.id)
  if (error) return { error: error.message }
  revalidatePath('/admin/finances')
  return { error: null }
}

/** Short-lived signed URL to view a receipt (finance admins only). */
export async function getReceiptUrl(kind: ReceiptKind, expenseId: string): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { url: null, error: auth.error }

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from(RECEIPT_TABLE[kind])
    .select('receipt_path')
    .eq('id', expenseId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!row?.receipt_path) return { url: null, error: 'No receipt attached' }
  const { data, error } = await db.storage
    .from('expense-receipts')
    .createSignedUrl(row.receipt_path, 600)
  if (error || !data?.signedUrl) return { url: null, error: error?.message ?? 'Could not create link' }
  return { url: data.signedUrl, error: null }
}

/** Detach and delete an expense's receipt. */
export async function removeExpenseReceipt(kind: ReceiptKind, expenseId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from(RECEIPT_TABLE[kind])
    .select('receipt_path')
    .eq('id', expenseId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!row?.receipt_path) return { error: null }
  await db.storage.from('expense-receipts').remove([row.receipt_path])
  const { error } = await db.from(RECEIPT_TABLE[kind])
    .update({ receipt_path: null })
    .eq('id', expenseId)
    .eq('organization_id', org.id)
  if (error) return { error: error.message }
  revalidatePath('/admin/finances')
  return { error: null }
}

export async function deleteOrgOverhead(id: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  const db = createServiceRoleClient()

  const { error } = await db
    .from('org_overhead_expenses').delete().eq('id', id).eq('organization_id', org.id)
  if (error) return { error: error.message }

  revalidatePath('/admin/finances')
  return { error: null }
}

// ── Org-wide profit & loss ───────────────────────────────────────────────────

export type OrgPnlEvent = {
  leagueId: string | null   // null = standalone shop
  name: string
  revenueCents: number
  costCents: number
  profitCents: number
}

export type OrgPnl = {
  registrationRevenueCents: number
  /** Refunds issued (already subtracted from revenueCents). */
  refundedCents: number
  merchRevenueCents: number
  otherRevenueCents: number
  merchCogsCents: number
  eventExpenseCents: number
  overheadCents: number
  revenueCents: number      // registrations + all merch
  costCents: number         // event expenses + overhead + merch COGS
  profitCents: number
  marginPct: number | null
  events: OrgPnlEvent[]      // per-event rows incl. a "Shop" row for league_id null
}

/**
 * Org-wide P&L across every event and the standalone shop, net of org overhead.
 * Revenue = registration payments (paid/manual) + all merch (paid/fulfilled).
 * Cost = logged event expenses + merch COGS + org overhead. Overhead is summed
 * as logged (period is informational) and is not split per event.
 */
export async function getOrgPnl(orgId: string): Promise<OrgPnl> {
  const db = createServiceRoleClient()


  const [{ data: payments }, { data: merchOrders }, { data: expenses }, { data: overhead }, { data: leagues }, { data: otherRevenue }, { data: overheadAllocs }] = await Promise.all([

    db.from('payments').select('amount_cents, refunded_cents, league_id, payment_type, team_id, registration_id')
      .eq('organization_id', orgId).in('status', ['paid', 'manual', 'refunded']),

    db.from('merchandise_orders')
      .select('league_id, item_id, variant_id, quantity, unit_price_cents, discount_cents, amount_paid_cents')
      .eq('organization_id', orgId).in('status', ['paid', 'fulfilled']),

    db.from('event_expenses').select('league_id, amount_cents').eq('organization_id', orgId),

    db.from('org_overhead_expenses').select('amount_cents').eq('organization_id', orgId),

    db.from('leagues').select('id, name').eq('organization_id', orgId),

    db.from('event_revenue').select('league_id, amount_cents').eq('organization_id', orgId),

    db.from('org_overhead_allocations').select('league_id, amount_cents').eq('organization_id', orgId),
  ])

  const leagueName = new Map<string, string>()
  for (const l of (leagues ?? []) as { id: string; name: string }[]) leagueName.set(l.id, l.name)
  // Allocated overhead shows on its event's cost row; org totals already count
  // the full overhead sum, so no amount is added twice.
  const allocByLeague = new Map<string, number>()
  for (const a of (overheadAllocs ?? []) as { league_id: string; amount_cents: number }[]) {
    allocByLeague.set(a.league_id, (allocByLeague.get(a.league_id) ?? 0) + (a.amount_cents ?? 0))
  }

  // Per-bucket aggregation; key '' = standalone shop (league_id null)
  const revByKey = new Map<string, number>()   // registrations + merch revenue
  const costByKey = new Map<string, number>()  // event expenses + merch COGS
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

  // Same rules as getEventPnl: team fees count once per team, and per-player
  // rows detached from a deleted registration don't count.
  let registrationRevenueCents = 0
  let refundedCents = 0
  const seenOrgTeams = new Set<string>()
  for (const p of (payments ?? []) as { amount_cents: number; refunded_cents: number | null; league_id: string | null; payment_type: string | null; team_id: string | null; registration_id: string | null }[]) {
    if (p.payment_type === 'team' && p.team_id) {
      if (seenOrgTeams.has(`${p.league_id}:${p.team_id}`)) continue
      seenOrgTeams.add(`${p.league_id}:${p.team_id}`)
    } else if (!p.registration_id) continue
    registrationRevenueCents += p.amount_cents ?? 0
    refundedCents += p.refunded_cents ?? 0
    // Per-event rows show revenue net of refunds.
    add(revByKey, p.league_id ?? '', (p.amount_cents ?? 0) - (p.refunded_cents ?? 0))
  }

  // Merch revenue + COGS (needs item/variant costs)
  const orders = (merchOrders ?? []) as {
    league_id: string | null; item_id: string; variant_id: string | null
    quantity: number; unit_price_cents: number; discount_cents: number | null; amount_paid_cents: number | null
  }[]
  let merchRevenueCents = 0
  let merchCogsCents = 0
  if (orders.length > 0) {
    const itemIds = [...new Set(orders.map((o) => o.item_id))]
    const variantIds = [...new Set(orders.map((o) => o.variant_id).filter(Boolean) as string[])]
    const [{ data: items }, { data: variants }] = await Promise.all([

      db.from('merchandise_items').select('id, cost_cents').in('id', itemIds),
      variantIds.length > 0

        ? db.from('merchandise_variants').select('id, cost_cents').in('id', variantIds)
        : Promise.resolve({ data: [] }),
    ])
    const itemCost = new Map<string, number | null>()
    for (const i of (items ?? []) as { id: string; cost_cents: number | null }[]) itemCost.set(i.id, i.cost_cents)
    const variantCost = new Map<string, number | null>()
    for (const v of (variants ?? []) as { id: string; cost_cents: number | null }[]) variantCost.set(v.id, v.cost_cents)

    for (const o of orders) {
      const rev = o.amount_paid_cents ?? (o.unit_price_cents * o.quantity - (o.discount_cents ?? 0))
      merchRevenueCents += rev
      add(revByKey, o.league_id ?? '', rev)
      const unit = unitCogs(o.variant_id, itemCost.get(o.item_id), variantCost)
      if (unit !== null) {
        const c = unit * o.quantity
        merchCogsCents += c
        add(costByKey, o.league_id ?? '', c)
      }
    }
  }

  let eventExpenseCents = 0
  for (const e of (expenses ?? []) as { league_id: string; amount_cents: number }[]) {
    eventExpenseCents += e.amount_cents ?? 0
    add(costByKey, e.league_id ?? '', e.amount_cents ?? 0)
  }
  for (const [leagueId, cents] of allocByLeague) add(costByKey, leagueId, cents)

  // Other income (donations, 50/50, sponsorships…) per event.
  let otherRevenueCents = 0
  for (const r of (otherRevenue ?? []) as { league_id: string; amount_cents: number }[]) {
    otherRevenueCents += r.amount_cents ?? 0
    add(revByKey, r.league_id ?? '', r.amount_cents ?? 0)
  }

  const overheadCents = ((overhead ?? []) as { amount_cents: number }[]).reduce((s, o) => s + (o.amount_cents ?? 0), 0)

  // Build per-event rows (union of all keys seen in revenue or cost)
  const keys = new Set<string>([...revByKey.keys(), ...costByKey.keys()])
  const events: OrgPnlEvent[] = [...keys].map((k) => {
    const revenue = revByKey.get(k) ?? 0
    const cost = costByKey.get(k) ?? 0
    return {
      leagueId: k === '' ? null : k,
      name: k === '' ? 'Shop (no event)' : (leagueName.get(k) ?? 'Unknown event'),
      revenueCents: revenue,
      costCents: cost,
      profitCents: revenue - cost,
    }
  }).sort((a, b) => b.revenueCents - a.revenueCents)

  const revenueCents = registrationRevenueCents + merchRevenueCents + otherRevenueCents - refundedCents
  const costCents = eventExpenseCents + merchCogsCents + overheadCents
  const profitCents = revenueCents - costCents
  const marginPct = revenueCents > 0 ? profitCents / revenueCents : null

  return {
    registrationRevenueCents, refundedCents, merchRevenueCents, otherRevenueCents, merchCogsCents,
    eventExpenseCents, overheadCents, revenueCents, costCents, profitCents, marginPct, events,
  }
}

// ── Pricing planner (event budgets) ──────────────────────────────────────────

export type BudgetItem = {
  id: string
  label: string
  cost_type: BudgetCostType
  amount_cents: number
  sort_order: number
}

/** Billing model a plan is costed against. */
export type BudgetPricingModel = 'per_player' | 'per_team'

export type EventBudget = {
  budget: {
    expected_teams: number
    expected_participants: number
    target_margin_pct: number
    notes: string | null
    /** Null = follow the league's payment_mode. */
    pricing_model: BudgetPricingModel | null
  } | null
  items: BudgetItem[]
  /** League's current price + mode, for the "profit at current price" projection. */
  league: { price_cents: number; payment_mode: 'per_player' | 'per_team' } | null
}

export async function getEventBudget(leagueId: string): Promise<EventBudget> {
  const db = createServiceRoleClient()


  const [{ data: budget }, { data: league }] = await Promise.all([

    db.from('event_budgets')
      .select('id, expected_teams, expected_participants, target_margin_pct, notes, pricing_model')
      .eq('league_id', leagueId).maybeSingle(),

    db.from('leagues').select('price_cents, payment_mode').eq('id', leagueId).single(),
  ])

  let items: BudgetItem[] = []
  if (budget?.id) {

    const { data: rows } = await db
      .from('event_budget_items')
      .select('id, label, cost_type, amount_cents, sort_order')
      .eq('budget_id', budget.id)
      .order('sort_order', { ascending: true })
    items = (rows ?? []) as BudgetItem[]
  }

  return {
    budget: budget
      ? {
          expected_teams: budget.expected_teams,
          expected_participants: budget.expected_participants,
          target_margin_pct: Number(budget.target_margin_pct),
          notes: budget.notes ?? null,
          pricing_model: (budget.pricing_model as BudgetPricingModel | null) ?? null,
        }
      : null,
    items,
    league: league
      ? { price_cents: league.price_cents ?? 0, payment_mode: (league.payment_mode ?? 'per_player') as 'per_player' | 'per_team' }
      : null,
  }
}

export async function saveEventBudget(input: {
  leagueId: string
  expectedTeams: number
  expectedParticipants: number
  targetMarginPct: number   // fraction 0–0.99
  notes?: string | null
  /** Billing model to cost the plan against; null follows the event's own mode. */
  pricingModel?: BudgetPricingModel | null
  items: { label: string; costType: BudgetCostType; amountCents: number }[]
}): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  const margin = Number(input.targetMarginPct)
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) return { error: 'Target margin must be between 0 and 99%.' }
  if (input.pricingModel && input.pricingModel !== 'per_player' && input.pricingModel !== 'per_team') {
    return { error: 'Invalid pricing model.' }
  }
  for (const it of input.items) {
    if (!BUDGET_COST_TYPES.includes(it.costType)) return { error: 'Invalid cost type.' }
    if (!Number.isFinite(it.amountCents) || it.amountCents < 0) return { error: 'Enter valid cost amounts.' }
  }

  const db = createServiceRoleClient()
  // Verify the league belongs to this org.

  const { data: league } = await db
    .from('leagues').select('id').eq('id', input.leagueId).eq('organization_id', org.id).single()
  if (!league) return { error: 'Event not found.' }

  // Upsert the budget row (unique on league_id) and capture its id.

  const { data: budget, error: budgetErr } = await db
    .from('event_budgets')
    .upsert({
      organization_id: org.id,
      league_id: input.leagueId,
      expected_teams: Math.max(0, Math.round(input.expectedTeams) || 0),
      expected_participants: Math.max(0, Math.round(input.expectedParticipants) || 0),
      target_margin_pct: margin,
      pricing_model: input.pricingModel ?? null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'league_id' })
    .select('id')
    .single()
  if (budgetErr || !budget) return { error: budgetErr?.message ?? 'Could not save budget.' }

  // Replace the line items.

  await db.from('event_budget_items').delete().eq('budget_id', budget.id)
  const rows = input.items
    .filter((it) => it.label.trim())
    .map((it, i) => ({
      budget_id: budget.id,
      label: it.label.trim(),
      cost_type: it.costType,
      amount_cents: Math.round(it.amountCents),
      sort_order: i,
    }))
  if (rows.length > 0) {

    const { error: itemsErr } = await db.from('event_budget_items').insert(rows)
    if (itemsErr) return { error: itemsErr.message }
  }

  revalidatePath(`/admin/events/${input.leagueId}/finances`)
  return { error: null }
}

// ── Event other income (donations, 50/50, sponsorships, etc.) ────────────────

export type EventRevenue = {
  id: string
  league_id: string
  category: RevenueCategory
  description: string
  amount_cents: number
  source: string | null
  received_on: string | null
  notes: string | null
  created_at: string
}

export async function getEventRevenue(leagueId: string): Promise<EventRevenue[]> {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('event_revenue')
    .select('id, league_id, category, description, amount_cents, source, received_on, notes, created_at')
    .eq('league_id', leagueId)
    .order('received_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as EventRevenue[]
}

export async function addEventRevenue(input: {
  leagueId: string
  category: RevenueCategory
  description: string
  amountCents: number
  source?: string
  receivedOn?: string | null
  notes?: string
}): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  if (!input.description.trim()) return { error: 'Description is required.' }
  if (!Number.isFinite(input.amountCents) || input.amountCents < 0) return { error: 'Enter a valid amount.' }
  if (!REVENUE_CATEGORIES.includes(input.category)) return { error: 'Invalid category.' }

  const db = createServiceRoleClient()

  const { data: league } = await db
    .from('leagues').select('id').eq('id', input.leagueId).eq('organization_id', org.id).single()
  if (!league) return { error: 'Event not found.' }


  const { error } = await db.from('event_revenue').insert({
    organization_id: org.id,
    league_id: input.leagueId,
    category: input.category,
    description: input.description.trim(),
    amount_cents: Math.round(input.amountCents),
    source: input.source?.trim() || null,
    received_on: input.receivedOn || null,
    notes: input.notes?.trim() || null,
    created_by: auth.userId,
  })
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${input.leagueId}/finances`)
  return { error: null }
}

export async function deleteEventRevenue(revenueId: string, leagueId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  const db = createServiceRoleClient()

  const { error } = await db
    .from('event_revenue').delete().eq('id', revenueId).eq('organization_id', org.id)
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/finances`)
  return { error: null }
}
