'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders } = await (db as any)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: items }, { data: variants }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('merchandise_items').select('id, name, cost_cents').in('id', itemIds),
    variantIds.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (db as any).from('merchandise_variants').select('id, cost_cents').in('id', variantIds)
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

export const EXPENSE_CATEGORIES = [
  'rental', 'referee', 'insurance', 'prizes', 'equipment', 'staff', 'marketing', 'other',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export type EventExpense = {
  id: string
  league_id: string
  category: ExpenseCategory
  description: string
  amount_cents: number
  vendor: string | null
  incurred_on: string | null
  notes: string | null
  created_at: string
}

export async function getEventExpenses(leagueId: string): Promise<EventExpense[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('event_expenses')
    .select('id, league_id, category, description, amount_cents, vendor, incurred_on, notes, created_at')
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('id').eq('id', input.leagueId).eq('organization_id', org.id).single()
  if (!league) return { error: 'Event not found.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('event_expenses').insert({
    organization_id: org.id,
    league_id: input.leagueId,
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

export async function deleteEventExpense(expenseId: string, leagueId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireFinanceAdmin(org.id)
  if ('error' in auth) return { error: auth.error }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('event_expenses').delete().eq('id', expenseId).eq('organization_id', org.id)
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/finances`)
  return { error: null }
}

// ── Per-event profit & loss ──────────────────────────────────────────────────

export type EventPnl = {
  registrationRevenueCents: number
  merchRevenueCents: number
  merchCogsCents: number
  expenseCents: number
  /** Total revenue = registrations + event merch. */
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

  const [{ data: payments }, { data: merchOrders }, { data: expenses }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('payments')
      .select('amount_cents, status')
      .eq('organization_id', orgId).eq('league_id', leagueId).in('status', ['paid', 'manual']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('merchandise_orders')
      .select('item_id, variant_id, quantity, unit_price_cents, discount_cents, amount_paid_cents')
      .eq('organization_id', orgId).eq('league_id', leagueId).in('status', ['paid', 'fulfilled']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('event_expenses').select('amount_cents').eq('league_id', leagueId),
  ])

  const registrationRevenueCents = ((payments ?? []) as { amount_cents: number }[])
    .reduce((s, p) => s + (p.amount_cents ?? 0), 0)

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('merchandise_items').select('id, cost_cents').in('id', itemIds),
      variantIds.length > 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (db as any).from('merchandise_variants').select('id, cost_cents').in('id', variantIds)
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

  const revenueCents = registrationRevenueCents + merchRevenueCents
  const costCents = expenseCents + merchCogsCents
  const profitCents = revenueCents - costCents
  const marginPct = revenueCents > 0 ? profitCents / revenueCents : null

  return {
    registrationRevenueCents, merchRevenueCents, merchCogsCents,
    expenseCents, revenueCents, costCents, profitCents, marginPct,
    expenseCount: expenseRows.length,
  }
}
