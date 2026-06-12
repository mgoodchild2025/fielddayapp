'use server'

import { createServiceRoleClient } from '@/lib/supabase/service'

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
