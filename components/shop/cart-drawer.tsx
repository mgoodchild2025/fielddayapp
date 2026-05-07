'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useCart } from './cart-provider'

interface Props {
  orgId: string
}

export function CartDrawer({ orgId }: Props) {
  const { items, removeItem, updateQty, clearCart, totalCents, isOpen, closeCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  async function handleCheckout() {
    if (items.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/shop-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          items: items.map((c) => ({
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

  const currency = items[0]?.currency?.toUpperCase() ?? 'CAD'

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity"
          onClick={closeCart}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-900">Your Cart</h2>
          <button
            type="button"
            onClick={closeCart}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
            aria-label="Close cart"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-600">Your cart is empty</p>
              <p className="text-xs text-gray-400">Add items from the shop to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-3">
                  {/* Image */}
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-100 border">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                    {item.variantLabel && (
                      <p className="text-xs text-gray-500">{item.variantLabel}</p>
                    )}
                    <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--brand-primary)' }}>
                      ${((item.unitPriceCents * item.quantity) / 100).toFixed(2)}
                    </p>

                    {/* Qty + remove */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex items-center border rounded-md overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateQty(idx, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors text-sm"
                          aria-label="Decrease"
                        >−</button>
                        <span className="w-7 text-center text-sm font-medium text-gray-800">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(idx, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors text-sm"
                          aria-label="Increase"
                        >+</button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t px-5 py-4 space-y-3">
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-bold text-lg text-gray-900">
                ${(totalCents / 100).toFixed(2)} <span className="text-sm font-normal text-gray-500">{currency}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {loading ? 'Redirecting to checkout…' : `Checkout →`}
            </button>

            <button
              type="button"
              onClick={() => { clearCart(); closeCart() }}
              className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear cart
            </button>
          </div>
        )}
      </div>
    </>
  )
}
