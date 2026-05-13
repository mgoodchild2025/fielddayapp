'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import type { CartItem } from '@/components/shop/cart-provider'

// ── Types ─────────────────────────────────────────────────────────────────────

type StoredCartItem = CartItem & { cartItemId: string }

type CartRow = {
  id: string
  quantity: number
  item: { id: string; name: string; price_cents: number; currency: string | null; image_url: string | null } | null
  variant: { id: string; label: string } | null
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadCart(orgId: string): Promise<StoredCartItem[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('cart_items')
    .select(`
      id,
      quantity,
      item:merchandise_items!item_id(id, name, price_cents, currency, image_url),
      variant:merchandise_variants!variant_id(id, label)
    `)
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .order('created_at')

  if (error) {
    console.error('[cart] loadCart error:', error.message)
    return []
  }
  if (!data) return []

  return (data as unknown as CartRow[])
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
  orgId:     string,
  itemId:    string,
  variantId: string | null,
  quantity:  number,
): Promise<string | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = createServiceRoleClient()

  // Check for existing row (NULL-safe variant match)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db as any)
    .from('cart_items')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .eq('item_id', itemId)

  query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null)

  const { data: existing } = await query.maybeSingle()

  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .from('cart_items')
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return existing.id as string
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertError } = await (db as any)
    .from('cart_items')
    .insert({
      organization_id: orgId,
      user_id:         user.id,
      item_id:         itemId,
      variant_id:      variantId ?? null,
      quantity,
    })
    .select('id')
    .single()

  if (insertError) console.error('[cart] saveCartItem insert error:', insertError.message)
  return (inserted?.id as string) ?? null
}

// ── Delete one ────────────────────────────────────────────────────────────────

export async function deleteCartItem(cartItemId: string): Promise<void> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('cart_items')
    .delete()
    .eq('id', cartItemId)
    .eq('user_id', user.id)
}

// ── Clear all ─────────────────────────────────────────────────────────────────

export async function clearCartItems(orgId: string): Promise<void> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('cart_items')
    .delete()
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
}
