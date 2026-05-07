'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

// ── Types ──────────────────────────────────────────────────────────────────────

export type MerchVariant = {
  id: string
  label: string
  stock_quantity: number | null
  sort_order: number
}

// Internal type that includes the FK column (used when reading from DB)
type MerchVariantRow = MerchVariant & { item_id: string }

export type MerchItem = {
  id: string
  organization_id: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  image_url: string | null
  is_active: boolean
  created_at: string
  variants: MerchVariant[]
}

export type MerchOrder = {
  id: string
  organization_id: string
  league_id: string
  registration_id: string | null
  user_id: string
  item_id: string
  variant_id: string | null
  quantity: number
  unit_price_cents: number
  status: 'pending' | 'paid' | 'fulfilled' | 'cancelled'
  notes: string | null
  payment_id: string | null
  created_at: string
  fulfilled_at: string | null
  // joined fields
  player_name?: string | null
  player_email?: string | null
  item_name?: string
  variant_label?: string | null
}

export type MerchOrderInput = {
  itemId: string
  variantId: string | null
  quantity: number
  unitPriceCents: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getCallerRole(orgId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()

  return member?.role ?? null
}

// ── Read actions ───────────────────────────────────────────────────────────────

/** Fetch all merchandise items (active + inactive) for the org's item library. */
export async function getMerchandiseItems(orgId: string): Promise<MerchItem[]> {
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items, error } = await (db as any)
    .from('merchandise_items')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  if (error || !items) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: variants } = await (db as any)
    .from('merchandise_variants')
    .select('*')
    .in('item_id', (items as MerchItem[]).map((i) => i.id))
    .order('sort_order', { ascending: true })

  const variantsByItem = new Map<string, MerchVariant[]>()
  for (const v of (variants ?? []) as MerchVariantRow[]) {
    const arr = variantsByItem.get(v.item_id) ?? []
    arr.push(v)
    variantsByItem.set(v.item_id, arr)
  }

  return (items as MerchItem[]).map((item) => ({
    ...item,
    variants: variantsByItem.get(item.id) ?? [],
  }))
}

/** Fetch items + variants attached to a specific league (active items only). */
export async function getLeagueMerchandise(leagueId: string): Promise<MerchItem[]> {
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (db as any)
    .from('league_merchandise')
    .select('item_id')
    .eq('league_id', leagueId)

  if (error || !rows || (rows as { item_id: string }[]).length === 0) return []

  const itemIds = (rows as { item_id: string }[]).map((r) => r.item_id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items } = await (db as any)
    .from('merchandise_items')
    .select('*')
    .in('id', itemIds)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (!items || (items as MerchItem[]).length === 0) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: variants } = await (db as any)
    .from('merchandise_variants')
    .select('*')
    .in('item_id', (items as MerchItem[]).map((i) => i.id))
    .order('sort_order', { ascending: true })

  const variantsByItem = new Map<string, MerchVariant[]>()
  for (const v of (variants ?? []) as MerchVariantRow[]) {
    const arr = variantsByItem.get(v.item_id) ?? []
    arr.push(v)
    variantsByItem.set(v.item_id, arr)
  }

  return (items as MerchItem[]).map((item) => ({
    ...item,
    variants: variantsByItem.get(item.id) ?? [],
  }))
}

/** Fetch all orders for a league with joined player and item details. */
export async function getMerchandiseOrders(leagueId: string): Promise<MerchOrder[]> {
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders, error } = await (db as any)
    .from('merchandise_orders')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })

  if (error || !orders || (orders as MerchOrder[]).length === 0) return []

  const typedOrders = orders as MerchOrder[]
  const userIds = [...new Set(typedOrders.map((o) => o.user_id))]
  const itemIds = [...new Set(typedOrders.map((o) => o.item_id))]
  const variantIds = typedOrders.map((o) => o.variant_id).filter(Boolean) as string[]

  const [{ data: profiles }, { data: items }, { data: variants }] = await Promise.all([
    db.from('profiles').select('id, full_name, email').in('id', userIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('merchandise_items').select('id, name').in('id', itemIds),
    variantIds.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (db as any).from('merchandise_variants').select('id, label').in('id', variantIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap = new Map<string, { full_name: string | null; email: string | null }>()
  for (const p of (profiles ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    profileMap.set(p.id, p)
  }

  const itemMap = new Map<string, string>()
  for (const i of (items ?? []) as { id: string; name: string }[]) {
    itemMap.set(i.id, i.name)
  }

  const variantMap = new Map<string, string>()
  for (const v of (variants ?? []) as { id: string; label: string }[]) {
    variantMap.set(v.id, v.label)
  }

  return typedOrders.map((order) => ({
    ...order,
    player_name: profileMap.get(order.user_id)?.full_name ?? null,
    player_email: profileMap.get(order.user_id)?.email ?? null,
    item_name: itemMap.get(order.item_id) ?? 'Unknown item',
    variant_label: order.variant_id ? (variantMap.get(order.variant_id) ?? null) : null,
  }))
}

// ── Write actions ──────────────────────────────────────────────────────────────

/** Create or update a merchandise item. Org admin only. */
export async function upsertMerchandiseItem(data: {
  id?: string
  name: string
  description?: string | null
  price_cents: number
  currency?: string
  image_url?: string | null
  is_active?: boolean
}): Promise<{ error: string | null; id: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const role = await getCallerRole(org.id)
  if (!role || !['org_admin', 'league_admin'].includes(role)) {
    return { error: 'Unauthorized', id: null }
  }

  const db = createServiceRoleClient()
  const row = {
    organization_id: org.id,
    name: data.name.trim(),
    description: data.description?.trim() ?? null,
    price_cents: data.price_cents,
    currency: data.currency ?? 'cad',
    image_url: data.image_url ?? null,
    is_active: data.is_active ?? true,
  }

  if (data.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('merchandise_items')
      .update(row)
      .eq('id', data.id)
      .eq('organization_id', org.id)

    if (error) return { error: error.message, id: null }
    revalidatePath('/admin/settings/merchandise')
    return { error: null, id: data.id }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await (db as any)
      .from('merchandise_items')
      .insert(row)
      .select('id')
      .single()

    if (error) return { error: error.message, id: null }
    revalidatePath('/admin/settings/merchandise')
    return { error: null, id: (inserted as { id: string }).id }
  }
}

/** Soft-delete a merchandise item (set is_active=false). Org admin only. */
export async function deleteMerchandiseItem(itemId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const role = await getCallerRole(org.id)
  if (!role || !['org_admin', 'league_admin'].includes(role)) {
    return { error: 'Unauthorized' }
  }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('merchandise_items')
    .update({ is_active: false })
    .eq('id', itemId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings/merchandise')
  return { error: null }
}

/** Replace all variants for an item. Pass an empty array to remove all. */
export async function upsertMerchandiseVariants(
  itemId: string,
  variants: { label: string; stock_quantity?: number | null }[]
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const role = await getCallerRole(org.id)
  if (!role || !['org_admin', 'league_admin'].includes(role)) {
    return { error: 'Unauthorized' }
  }

  const db = createServiceRoleClient()

  // Verify the item belongs to this org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: item } = await (db as any)
    .from('merchandise_items')
    .select('id')
    .eq('id', itemId)
    .eq('organization_id', org.id)
    .single()

  if (!item) return { error: 'Item not found' }

  // Delete all existing variants then re-insert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delErr } = await (db as any)
    .from('merchandise_variants')
    .delete()
    .eq('item_id', itemId)

  if (delErr) return { error: delErr.message }

  if (variants.length > 0) {
    const rows = variants.map((v, i) => ({
      item_id: itemId,
      label: v.label.trim(),
      stock_quantity: v.stock_quantity ?? null,
      sort_order: i,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (db as any)
      .from('merchandise_variants')
      .insert(rows)

    if (insErr) return { error: insErr.message }
  }

  revalidatePath('/admin/settings/merchandise')
  return { error: null }
}

/** Attach or detach an item from a league. */
export async function toggleLeagueMerchandise(
  leagueId: string,
  itemId: string,
  enabled: boolean
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const role = await getCallerRole(org.id)
  if (!role || !['org_admin', 'league_admin'].includes(role)) {
    return { error: 'Unauthorized' }
  }

  const db = createServiceRoleClient()

  if (enabled) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('league_merchandise')
      .upsert({ league_id: leagueId, item_id: itemId }, { onConflict: 'league_id,item_id', ignoreDuplicates: true })

    if (error) return { error: error.message }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('league_merchandise')
      .delete()
      .eq('league_id', leagueId)
      .eq('item_id', itemId)

    if (error) return { error: error.message }
  }

  revalidatePath(`/admin/events/${leagueId}/merchandise`)
  return { error: null }
}

/** Create pending merchandise orders before Stripe redirect. */
export async function createMerchandiseOrders(
  orders: MerchOrderInput[],
  opts: {
    leagueId: string
    registrationId: string
    userId: string
    orgId: string
  }
): Promise<{ error: string | null; orderIds: string[] }> {
  if (orders.length === 0) return { error: null, orderIds: [] }

  const db = createServiceRoleClient()

  const rows = orders.map((o) => ({
    organization_id: opts.orgId,
    league_id: opts.leagueId,
    registration_id: opts.registrationId,
    user_id: opts.userId,
    item_id: o.itemId,
    variant_id: o.variantId ?? null,
    quantity: o.quantity,
    unit_price_cents: o.unitPriceCents,
    status: 'pending',
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('merchandise_orders')
    .insert(rows)
    .select('id')

  if (error) return { error: error.message, orderIds: [] }
  const orderIds = ((data ?? []) as { id: string }[]).map((r) => r.id)
  return { error: null, orderIds }
}

/** Mark a single order as fulfilled. */
export async function fulfillMerchandiseOrder(orderId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const role = await getCallerRole(org.id)
  if (!role || !['org_admin', 'league_admin'].includes(role)) {
    return { error: 'Unauthorized' }
  }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('merchandise_orders')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  return { error: null }
}

/** Bulk fulfill all paid orders for a league. */
export async function fulfillAllMerchandiseOrders(leagueId: string): Promise<{ error: string | null; count: number }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const role = await getCallerRole(org.id)
  if (!role || !['org_admin', 'league_admin'].includes(role)) {
    return { error: 'Unauthorized', count: 0 }
  }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('merchandise_orders')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .eq('status', 'paid')
    .select('id')

  if (error) return { error: error.message, count: 0 }
  return { error: null, count: ((data ?? []) as unknown[]).length }
}

/** Cancel all pending orders for a registration (player abandoned checkout). */
export async function cancelMerchandiseOrders(registrationId: string): Promise<{ error: string | null }> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('merchandise_orders')
    .update({ status: 'cancelled' })
    .eq('registration_id', registrationId)
    .eq('status', 'pending')

  if (error) return { error: error.message }
  return { error: null }
}
