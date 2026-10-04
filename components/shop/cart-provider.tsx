'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { loadCart, saveCartItem, deleteCartItem, clearCartItems } from '@/actions/cart'
import { undoableRemove } from '@/components/ui/use-undoable-remove'

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
  /** The drawer's "Clear cart": empties now, Undo for a few seconds. */
  clearCartWithUndo: () => void
  totalCents: number
  totalCount: number
  isOpen:     boolean
  openCart:   () => void
  closeCart:  () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function CartProvider({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const [items,     setItems]     = useState<StoredItem[]>([])
  // Signed out: nothing to load (cart rows belong to a user).
  const [isLoading, setIsLoading] = useState(!!userId)
  const [isOpen,    setIsOpen]    = useState(false)

  // Keep a ref in sync so callbacks can read current items without stale closure
  const itemsRef = useRef<StoredItem[]>([])
  useEffect(() => { itemsRef.current = items }, [items])

  // Set when the cart is explicitly cleared (e.g. on the post-checkout success
  // page). Prevents the mount-time load effect from re-fetching and re-populating
  // the cart after a clear — the race that left purchased items lingering.
  const clearedRef = useRef(false)

  // The layout re-renders with a new userId after sign-in / sign-out
  // navigations: follow it (state adjusted during render).
  const [prevUserId, setPrevUserId] = useState(userId)
  if (userId !== prevUserId) {
    setPrevUserId(userId)
    if (userId) setIsLoading(true)
    else setItems([])
  }

  // ── DB helpers ─────────────────────────────────────────────────────────────
  // Server actions (actions/cart.ts), not a browser Supabase client: this
  // provider wraps every org page, and the client library cost ~52KB gzipped
  // of first-load JS on all of them. The server reads the session from the
  // cookie (refreshed by the proxy on every request) and the org from the
  // host, so the actions take only ids.

  const dbSave = useCallback(
    (itemId: string, variantId: string | null, quantity: number) => saveCartItem(itemId, variantId, quantity),
    [],
  )
  const dbDelete = useCallback((cartItemId: string) => deleteCartItem(cartItemId), [])
  const dbClear = useCallback(() => clearCartItems(), [])

  // ── Load on mount + after sign-in ─────────────────────────────────────────

  useEffect(() => {
    if (!isLoading) return  // only run when loading flag is set
    // If the cart was just cleared (success page), don't reload stale rows.
    if (clearedRef.current) { setIsLoading(false); return }
    let cancelled = false
    loadCart()
      .then((loaded) => {
        if (cancelled || clearedRef.current) return
        setItems(loaded)
      })
      .catch((err) => console.error('[cart] load error:', err))
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [isLoading])

  // ── addItem ────────────────────────────────────────────────────────────────

  const addItem = useCallback((newItem: CartItem) => {
    clearedRef.current = false  // adding re-enables loading/sync after a prior clear
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
    clearedRef.current = true
    setItems([])
    dbClear().catch(console.error)
  }, [dbClear])

  // Deletes only the rows that were in the cart when Clear was tapped, so an
  // item added during the Undo window survives.
  const clearCartWithUndo = useCallback(() => {
    const snapshot = itemsRef.current
    if (snapshot.length === 0) return
    const keyOf = (c: StoredItem) => `${c.itemId}:${c.variantId ?? 'none'}`
    setItems([])
    undoableRemove({
      label: 'Cart cleared',
      restore: () => setItems((prev) => [...snapshot.filter((c) => !prev.some((p) => keyOf(p) === keyOf(c))), ...prev]),
      commit: async () => {
        await Promise.all(snapshot.filter((c) => c.cartItemId).map((c) => dbDelete(c.cartItemId!)))
        return { error: null }
      },
    })
  }, [dbDelete])

  // ── Derived values ─────────────────────────────────────────────────────────

  const totalCents = items.reduce((s, c) => s + c.unitPriceCents * c.quantity, 0)
  const totalCount = items.reduce((s, c) => s + c.quantity, 0)
  const publicItems: CartItem[] = items.map(({ cartItemId: _, ...rest }) => rest)

  return (
    <CartContext.Provider value={{
      items: publicItems, isLoading,
      addItem, removeItem, updateQty, clearCart, clearCartWithUndo,
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
