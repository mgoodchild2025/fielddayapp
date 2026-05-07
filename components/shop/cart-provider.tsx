'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type CartItem = {
  itemId: string
  variantId: string | null
  quantity: number
  name: string
  variantLabel: string | null
  unitPriceCents: number
  currency: string
  imageUrl: string | null
}

type CartContextValue = {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (index: number) => void
  updateQty: (index: number, qty: number) => void
  clearCart: () => void
  totalCents: number
  totalCount: number
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

interface CartProviderProps {
  userId: string | null
  children: React.ReactNode
}

export function CartProvider({ userId, children }: CartProviderProps) {
  // Key is user-scoped so different users on the same device don't share a cart.
  // When userId is null (signed out) we don't touch localStorage at all.
  const storageKey = userId ? `fieldday-shop-cart-${userId}` : null

  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Load from localStorage on mount (only when signed in)
  useEffect(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          const parsed = JSON.parse(stored) as CartItem[]
          if (Array.isArray(parsed)) setItems(parsed)
        }
      } catch {
        // ignore malformed storage
      }
    }
    setHydrated(true)
  // storageKey is stable per user session — intentional single-run
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist to localStorage whenever items change (after hydration, signed-in only)
  useEffect(() => {
    if (!hydrated || !storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(items))
    } catch {
      // ignore storage errors (private browsing, full storage, etc.)
    }
  }, [items, hydrated, storageKey])

  const addItem = useCallback((newItem: CartItem) => {
    setItems((prev) => {
      const key = `${newItem.itemId}:${newItem.variantId ?? 'none'}`
      const idx = prev.findIndex(
        (c) => `${c.itemId}:${c.variantId ?? 'none'}` === key
      )
      if (idx >= 0) {
        return prev.map((c, i) =>
          i === idx ? { ...c, quantity: Math.min(10, c.quantity + newItem.quantity) } : c
        )
      }
      return [...prev, newItem]
    })
  }, [])

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateQty = useCallback((index: number, qty: number) => {
    if (qty < 1) {
      setItems((prev) => prev.filter((_, i) => i !== index))
      return
    }
    setItems((prev) =>
      prev.map((c, i) => i === index ? { ...c, quantity: Math.min(10, qty) } : c)
    )
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
    if (storageKey) {
      try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
    }
  }, [storageKey])

  const totalCents = items.reduce((sum, c) => sum + c.unitPriceCents * c.quantity, 0)
  const totalCount = items.reduce((sum, c) => sum + c.quantity, 0)

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      totalCents,
      totalCount,
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
