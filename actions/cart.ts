'use server'

import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import type { CartItem } from '@/components/shop/cart-provider'

// The persistent merch cart (cart_items, per user + org). CartProvider calls
// these instead of querying Supabase from the browser, which kept the whole
// Supabase client in every org page's JavaScript. Each export establishes the
// caller (signed-in user) and the org (from the proxy, never from the caller).

export type StoredCartItem = CartItem & { cartItemId: string }

type CartRow = {
  id: string
  quantity: number
  item: { id: string; name: string; price_cents: number; currency: string | null; image_url: string | null } | null
  variant: { id: string; label: string } | null
}

const MAX_QTY = 10
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function caller() {
  const [org, supabase] = await Promise.all([getCurrentOrg(await headers()), createServerClient()])
  const { data: { user } } = await supabase.auth.getUser()
  return { org, user }
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadCart(): Promise<StoredCartItem[]> {
  const { org, user } = await caller()
  if (!user) return []

  const { data, error } = await createServiceRoleClient()
    .from('cart_items')
    .select(`
      id,
      quantity,
      item:merchandise_items!item_id(id, name, price_cents, currency, image_url),
      variant:merchandise_variants!variant_id(id, label)
    `)
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .order('created_at')

  if (error) {
    console.error('[cart] loadCart error:', error.message)
    return []
  }

  return ((data ?? []) as unknown as CartRow[])
    .filter((row) => row.item !== null)
    .map((row) => ({
      cartItemId:     row.id,
      itemId:         row.item!.id,
      variantId:      row.variant?.id ?? null,
      quantity:       row.quantity,
      name:           row.item!.name,
      variantLabel:   row.variant?.label ?? null,
      unitPriceCents: row.item!.price_cents,
      currency:       row.item!.currency ?? 'cad',
      imageUrl:       row.item!.image_url,
    }))
}

// ── Save (insert or update) ───────────────────────────────────────────────────

export async function saveCartItem(
  itemId:    string,
  variantId: string | null,
  quantity:  number,
): Promise<string | null> {
  if (!UUID.test(itemId) || (variantId !== null && !UUID.test(variantId))) return null
  if (!Number.isInteger(quantity) || quantity < 1) return null
  const qty = Math.min(MAX_QTY, quantity)

  const { org, user } = await caller()
  if (!user) return null
  const db = createServiceRoleClient()

  // The item must be this org's (and the variant this item's) — the caller
  // only sends ids.
  const [{ data: item }, { data: variant }] = await Promise.all([
    db.from('merchandise_items').select('id').eq('id', itemId).eq('organization_id', org.id).maybeSingle(),
    variantId
      ? db.from('merchandise_variants').select('id').eq('id', variantId).eq('item_id', itemId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!item || (variantId && !variant)) return null

  // Existing row (NULL-safe variant match)
  const base = db
    .from('cart_items')
    .select('id')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('item_id', itemId)
  const { data: existing } = await (variantId ? base.eq('variant_id', variantId) : base.is('variant_id', null))
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    await db
      .from('cart_items')
      .update({ quantity: qty, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', user.id)
    return existing.id as string
  }

  const { data: inserted, error: insertError } = await db
    .from('cart_items')
    .insert({
      organization_id: org.id,
      user_id:         user.id,
      item_id:         itemId,
      variant_id:      variantId,
      quantity:        qty,
    })
    .select('id')
    .single()

  if (insertError) console.error('[cart] saveCartItem insert error:', insertError.message)
  return (inserted?.id as string) ?? null
}

// ── Delete one ────────────────────────────────────────────────────────────────

export async function deleteCartItem(cartItemId: string): Promise<void> {
  if (!UUID.test(cartItemId)) return
  const { org, user } = await caller()
  if (!user) return

  await createServiceRoleClient()
    .from('cart_items')
    .delete()
    .eq('id', cartItemId)
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
}

// ── Clear all ─────────────────────────────────────────────────────────────────

export async function clearCartItems(): Promise<void> {
  const { org, user } = await caller()
  if (!user) return

  await createServiceRoleClient()
    .from('cart_items')
    .delete()
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
}
