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

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = 'fieldday-shop-cart'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[]
        if (Array.isArray(parsed)) setItems(parsed)
      }
    } catch {
      // ignore malformed storage
    }
    setHydrated(true)
  }, [])

  // Persist to localStorage whenever items change (after hydration)
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // ignore storage errors (private browsing, full storage, etc.)
    }
  }, [items, hydrated])

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
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

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
