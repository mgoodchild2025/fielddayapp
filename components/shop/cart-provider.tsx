'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadCart, saveCartItem, deleteCartItem, clearCartItems } from '@/actions/cart'

// ── Public CartItem type (used by ShopItemCard, CartDrawer, etc.) ─────────────

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

// Internal extension that carries the DB row id
type StoredCartItem = CartItem & { cartItemId: string | null }

// ── Context ───────────────────────────────────────────────────────────────────

type CartContextValue = {
  items:       CartItem[]
  isLoading:   boolean
  addItem:     (item: CartItem) => void
  removeItem:  (index: number)  => void
  updateQty:   (index: number, qty: number) => void
  clearCart:   () => void
  totalCents:  number
  totalCount:  number
  isOpen:      boolean
  openCart:    () => void
  closeCart:   () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

interface CartProviderProps {
  orgId:    string
  children: React.ReactNode
}

export function CartProvider({ orgId, children }: CartProviderProps) {
  const [items,     setItems]     = useState<StoredCartItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen,    setIsOpen]    = useState(false)

  // ── Load cart from server on mount ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    loadCart(orgId).then((loaded) => {
      if (!cancelled) {
        setItems(loaded.map((c) => ({ ...c })))
        setIsLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  // orgId is stable per layout mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── addItem ────────────────────────────────────────────────────────────────
  const addItem = useCallback((newItem: CartItem) => {
    const key = `${newItem.itemId}:${newItem.variantId ?? 'none'}`

    setItems((prev) => {
      const idx = prev.findIndex(
        (c) => `${c.itemId}:${c.variantId ?? 'none'}` === key
      )
      if (idx >= 0) {
        // Merge: increment quantity
        const merged = prev.map((c, i) =>
          i === idx ? { ...c, quantity: Math.min(10, c.quantity + newItem.quantity) } : c
        )
        // Sync merged quantity to server in background
        const mergedItem = merged[idx]
        saveCartItem(orgId, newItem.itemId, newItem.variantId, mergedItem.quantity)
          .then((cartItemId) => {
            if (cartItemId) {
              setItems((cur) => cur.map((c, i) =>
                i === idx ? { ...c, cartItemId } : c
              ))
            }
          })
          .catch(console.error)
        return merged
      }
      // New item — optimistic add with null cartItemId until server responds
      const optimistic: StoredCartItem = { ...newItem, cartItemId: null }
      saveCartItem(orgId, newItem.itemId, newItem.variantId, newItem.quantity)
        .then((cartItemId) => {
          if (cartItemId) {
            setItems((cur) => {
              const newIdx = cur.findIndex(
                (c) => `${c.itemId}:${c.variantId ?? 'none'}` === key
              )
              if (newIdx >= 0) {
                return cur.map((c, i) => i === newIdx ? { ...c, cartItemId } : c)
              }
              return cur
            })
          }
        })
        .catch(console.error)
      return [...prev, optimistic]
    })
  }, [orgId])

  // ── removeItem ─────────────────────────────────────────────────────────────
  const removeItem = useCallback((index: number) => {
    setItems((prev) => {
      const item = prev[index]
      if (item?.cartItemId) {
        deleteCartItem(item.cartItemId).catch(console.error)
      }
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  // ── updateQty ──────────────────────────────────────────────────────────────
  const updateQty = useCallback((index: number, qty: number) => {
    if (qty < 1) {
      // Delegate to removeItem
      setItems((prev) => {
        const item = prev[index]
        if (item?.cartItemId) {
          deleteCartItem(item.cartItemId).catch(console.error)
        }
        return prev.filter((_, i) => i !== index)
      })
      return
    }
    const clamped = Math.min(10, qty)
    setItems((prev) => {
      const item = prev[index]
      if (!item) return prev
      if (item.cartItemId) {
        saveCartItem(orgId, item.itemId, item.variantId, clamped).catch(console.error)
      }
      return prev.map((c, i) => i === index ? { ...c, quantity: clamped } : c)
    })
  }, [orgId])

  // ── clearCart ──────────────────────────────────────────────────────────────
  const clearCart = useCallback(() => {
    setItems([])
    clearCartItems(orgId).catch(console.error)
  }, [orgId])

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totalCents = items.reduce((sum, c) => sum + c.unitPriceCents * c.quantity, 0)
  const totalCount = items.reduce((sum, c) => sum + c.quantity, 0)

  // Expose items without the internal cartItemId field
  const publicItems: CartItem[] = items.map(({ cartItemId: _, ...rest }) => rest)

  return (
    <CartContext.Provider value={{
      items:      publicItems,
      isLoading,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      totalCents,
      totalCount,
      isOpen,
      openCart:  () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
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
