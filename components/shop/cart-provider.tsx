'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Public CartItem type ───────────────────────────────────────────────────────

export type CartItem = {
  itemId:         string
  variantId:      string | null
  quantity:       number
  name:           string
  variantLabel:   string | null
  unitPriceCents: number
  currency:       string
  imageUrl:       string | null
}

// Internal: CartItem + the DB row id
type StoredItem = CartItem & { cartItemId: string | null }

// ── Context ───────────────────────────────────────────────────────────────────

type CartContextValue = {
  items:      CartItem[]
  isLoading:  boolean
  addItem:    (item: CartItem) => void
  removeItem: (index: number)  => void
  updateQty:  (index: number, qty: number) => void
  clearCart:  () => void
  totalCents: number
  totalCount: number
  isOpen:     boolean
  openCart:   () => void
  closeCart:  () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function CartProvider({ orgId, userId, children }: { orgId: string; userId: string | null; children: React.ReactNode }) {
  const [items,     setItems]     = useState<StoredItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen,    setIsOpen]    = useState(false)

  // Keep a ref in sync so callbacks can read current items without stale closure
  const itemsRef = useRef<StoredItem[]>([])
  useEffect(() => { itemsRef.current = items }, [items])

  // Single shared browser-client instance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const db = useCallback(() => createClient(), [])()

  // userId comes from the server-side layout — available synchronously, no race condition
  const userIdRef = useRef<string | null>(userId)
  console.log('[cart] CartProvider mounted, userId:', userId, 'orgId:', orgId)

  // ── Auth state listener ────────────────────────────────────────────────────
  // The server-side session can be stale (expired refresh token). When the
  // Supabase client refreshes auth on the client side, pick up the new userId
  // and reload the cart so cross-device sync works even with stale cookies.
  useEffect(() => {
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      const newId = session?.user?.id ?? null
      console.log('[cart] onAuthStateChange:', event, 'userId:', newId)
      if (newId && newId !== userIdRef.current) {
        userIdRef.current = newId
        // Trigger a cart reload by setting a flag via setIsLoading
        setIsLoading(true)
      }
      if (!session) {
        userIdRef.current = null
        setItems([])
      }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── DB helpers ─────────────────────────────────────────────────────────────

  const dbSave = useCallback(async (
    itemId: string, variantId: string | null, quantity: number
  ): Promise<string | null> => {
    const uid = userIdRef.current
    console.log('[cart] dbSave called, userId:', uid, 'itemId:', itemId, 'qty:', quantity)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (db as any).from('cart_items').select('id').eq('organization_id', orgId).eq('item_id', itemId)
    const { data: existing, error: existingError } = await (variantId ? q.eq('variant_id', variantId) : q.is('variant_id', null)).maybeSingle()
    console.log('[cart] existing check:', existing, existingError?.message)

    if (existing?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (db as any).from('cart_items').update({ quantity, updated_at: new Date().toISOString() }).eq('id', existing.id)
      console.log('[cart] update result:', updateError?.message ?? 'ok')
      return existing.id as string
    }

    if (!uid) { console.error('[cart] dbSave: userId is null, cannot insert'); return null }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await (db as any)
      .from('cart_items')
      .insert({ user_id: uid, organization_id: orgId, item_id: itemId, variant_id: variantId ?? null, quantity })
      .select('id')
      .single()
    console.log('[cart] insert result:', inserted?.id ?? null, error?.message)
    if (error) console.error('[cart] insert error:', error.message, error.code, error.details)
    return (inserted?.id as string) ?? null
  }, [db, orgId])

  const dbDelete = useCallback(async (cartItemId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from('cart_items').delete().eq('id', cartItemId)
    if (error) console.error('[cart] delete error:', error.message)
  }, [db])

  const dbClear = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from('cart_items').delete().eq('organization_id', orgId)
    if (error) console.error('[cart] clear error:', error.message)
  }, [db, orgId])

  // ── Load on mount + after auth resolves ───────────────────────────────────

  useEffect(() => {
    if (!isLoading) return  // only run when loading flag is set
    let cancelled = false
    ;(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db as any)
          .from('cart_items')
          .select('id, quantity, item_id, variant_id')
          .eq('organization_id', orgId)
          .order('created_at')

        console.log('[cart] load raw rows:', data?.length ?? 0, error?.message)
        if (error) { console.error('[cart] load error:', error.message, error.code, error.details); return }
        if (!data || cancelled) return
        if (data.length === 0) { setItems([]); return }

        // Enrich with item + variant display data in a single batch
        const itemIds    = [...new Set((data as { item_id: string }[]).map(r => r.item_id))]
        const variantIds = [...new Set((data as { variant_id: string | null }[]).map(r => r.variant_id).filter(Boolean) as string[])]

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [{ data: itemRows }, { data: variantRows }] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (db as any).from('merchandise_items').select('id, name, price_cents, currency, image_url').in('id', itemIds),
          variantIds.length > 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (db as any).from('merchandise_variants').select('id, label').in('id', variantIds)
            : Promise.resolve({ data: [] }),
        ])

        console.log('[cart] itemRows:', itemRows?.length ?? 0, 'variantRows:', variantRows?.length ?? 0)
        if (cancelled) return

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemMap    = new Map<string, any>((itemRows    ?? []).map((r: any) => [r.id, r]))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const variantMap = new Map<string, any>((variantRows ?? []).map((r: any) => [r.id, r]))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loaded: StoredItem[] = (data as any[])
          .filter((r: any) => itemMap.has(r.item_id))
          .map((r: any) => {
            const item    = itemMap.get(r.item_id)
            const variant = r.variant_id ? (variantMap.get(r.variant_id) ?? null) : null
            return {
              cartItemId:     r.id,
              itemId:         item.id,
              variantId:      r.variant_id ?? null,
              quantity:       r.quantity,
              name:           item.name,
              variantLabel:   variant?.label ?? null,
              unitPriceCents: item.price_cents,
              currency:       item.currency ?? 'cad',
              imageUrl:       item.image_url ?? null,
            }
          })

        console.log('[cart] loaded items:', loaded.length)
        setItems(loaded)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  // Re-runs whenever isLoading is set to true (initial mount + after auth resolves)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  // ── addItem ────────────────────────────────────────────────────────────────

  const addItem = useCallback((newItem: CartItem) => {
    const key = `${newItem.itemId}:${newItem.variantId ?? 'none'}`
    const current = itemsRef.current
    const idx = current.findIndex(c => `${c.itemId}:${c.variantId ?? 'none'}` === key)

    if (idx >= 0) {
      const newQty = Math.min(10, current[idx].quantity + newItem.quantity)
      setItems(prev => prev.map((c, i) => i === idx ? { ...c, quantity: newQty } : c))
      dbSave(newItem.itemId, newItem.variantId, newQty).catch(console.error)
    } else {
      setItems(prev => [...prev, { ...newItem, cartItemId: null }])
      dbSave(newItem.itemId, newItem.variantId, newItem.quantity).then(cartItemId => {
        if (!cartItemId) return
        setItems(prev => {
          const i = prev.findIndex(c => `${c.itemId}:${c.variantId ?? 'none'}` === key)
          return i >= 0 ? prev.map((c, j) => j === i ? { ...c, cartItemId } : c) : prev
        })
      }).catch(console.error)
    }
  }, [dbSave])

  // ── removeItem ─────────────────────────────────────────────────────────────

  const removeItem = useCallback((index: number) => {
    const item = itemsRef.current[index]
    setItems(prev => prev.filter((_, i) => i !== index))
    if (item?.cartItemId) dbDelete(item.cartItemId).catch(console.error)
  }, [dbDelete])

  // ── updateQty ──────────────────────────────────────────────────────────────

  const updateQty = useCallback((index: number, qty: number) => {
    const item = itemsRef.current[index]
    if (!item) return
    if (qty < 1) { removeItem(index); return }
    const clamped = Math.min(10, qty)
    setItems(prev => prev.map((c, i) => i === index ? { ...c, quantity: clamped } : c))
    dbSave(item.itemId, item.variantId, clamped).catch(console.error)
  }, [dbSave, removeItem])

  // ── clearCart ──────────────────────────────────────────────────────────────

  const clearCart = useCallback(() => {
    setItems([])
    dbClear().catch(console.error)
  }, [dbClear])

  // ── Derived values ─────────────────────────────────────────────────────────

  const totalCents = items.reduce((s, c) => s + c.unitPriceCents * c.quantity, 0)
  const totalCount = items.reduce((s, c) => s + c.quantity, 0)
  const publicItems: CartItem[] = items.map(({ cartItemId: _, ...rest }) => rest)

  return (
    <CartContext.Provider value={{
      items: publicItems, isLoading,
      addItem, removeItem, updateQty, clearCart,
      totalCents, totalCount,
      isOpen, openCart: () => setIsOpen(true), closeCart: () => setIsOpen(false),
    }}>
      {children}
    </CartContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
