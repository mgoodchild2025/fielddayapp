'use client'

import { useState } from 'react'
import { ShopItemCard } from './shop-item-card'
import type { CartItem } from './shop-item-card'
import type { ShopItem } from '@/actions/merchandise'

interface Props {
  items: ShopItem[]
  orgId: string
}

export function ShopClient({ items, orgId }: Props) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addToCart(newItem: CartItem) {
    setCart((prev) => {
      // Find existing cart entry with same item + variant
      const key = `${newItem.itemId}:${newItem.variantId ?? 'none'}`
      const existingIdx = prev.findIndex(
        (c) => `${c.itemId}:${c.variantId ?? 'none'}` === key
      )
      if (existingIdx >= 0) {
        // Merge quantity (cap at 10)
        return prev.map((c, i) =>
          i === existingIdx
            ? { ...c, quantity: Math.min(10, c.quantity + newItem.quantity) }
            : c
        )
      }
      return [...prev, newItem]
    })
  }

  function removeFromCart(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateQty(idx: number, qty: number) {
    if (qty < 1) { removeFromCart(idx); return }
    setCart((prev) => prev.map((c, i) => i === idx ? { ...c, quantity: Math.min(10, qty) } : c))
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.unitPriceCents * c.quantity, 0)
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0)

  async function handleCheckout() {
    if (cart.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/shop-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          items: cart.map((c) => ({
            itemId: c.itemId,
            variantId: c.variantId,
            quantity: c.quantity,
          })),
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'Something went wrong')
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="pb-32">
      {/* Item grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((item) => (
          <ShopItemCard key={item.id} item={item} onAddToCart={addToCart} />
        ))}
      </div>

      {/* Sticky cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-lg px-4 py-3">
          <div className="max-w-5xl mx-auto">
            {error && (
              <p className="text-xs text-red-600 mb-2">{error}</p>
            )}

            {/* Cart line items (expanded summary) */}
            <div className="space-y-1 mb-3">
              {cart.map((c, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-gray-800 truncate">
                    {c.name}{c.variantLabel ? ` — ${c.variantLabel}` : ''}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQty(idx, c.quantity - 1)}
                      className="w-6 h-6 rounded border flex items-center justify-center text-gray-500 hover:bg-gray-100 text-xs"
                    >−</button>
                    <span className="w-4 text-center text-xs font-medium">{c.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(idx, c.quantity + 1)}
                      className="w-6 h-6 rounded border flex items-center justify-center text-gray-500 hover:bg-gray-100 text-xs"
                    >+</button>
                  </div>
                  <span className="text-xs font-medium text-gray-700 w-14 text-right">
                    ${((c.unitPriceCents * c.quantity) / 100).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFromCart(idx)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                    aria-label="Remove"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Total row + checkout button */}
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-gray-500">
                <span className="font-semibold text-gray-900">{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
                {' · '}
                <span className="font-bold text-base" style={{ color: 'var(--brand-primary)' }}>
                  ${(cartTotal / 100).toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={loading}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition-opacity hover:opacity-90 shrink-0"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {loading ? 'Redirecting…' : 'Checkout →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
