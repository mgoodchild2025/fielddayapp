'use server'

import { createServerClient } from '@/lib/supabase/server'
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

  const { data, error } = await supabase
    .from('cart_items')
    .select(`
      id,
      quantity,
      item:merchandise_items!item_id(id, name, price_cents, currency, image_url),
      variant:merchandise_variants!variant_id(id, label)
    `)
    .eq('organization_id', orgId)
    .order('created_at')

  if (error || !data) return []

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

  // Check for existing row (NULL-safe variant match)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('cart_items')
    .select('id')
    .eq('organization_id', orgId)
    .eq('item_id', itemId)

  query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null)

  const { data: existing } = await query.maybeSingle()

  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('cart_items')
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return existing.id as string
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted } = await (supabase as any)
    .from('cart_items')
    .insert({
      organization_id: orgId,
      item_id:         itemId,
      variant_id:      variantId ?? null,
      quantity,
    })
    .select('id')
    .single()

  return (inserted?.id as string) ?? null
}

// ── Delete one ────────────────────────────────────────────────────────────────

export async function deleteCartItem(cartItemId: string): Promise<void> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('cart_items')
    .delete()
    .eq('id', cartItemId)
}

// ── Clear all ─────────────────────────────────────────────────────────────────

export async function clearCartItems(orgId: string): Promise<void> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('cart_items')
    .delete()
    .eq('organization_id', orgId)
}
