'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { ShopItem } from '@/actions/merchandise'
import type { CartItem } from './cart-provider'

interface Props {
  item: ShopItem
  onAddToCart: (cartItem: CartItem) => void
  addedKey: string | null
}

export function ShopItemCard({ item, onAddToCart, addedKey }: Props) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    item.variants.length === 1 ? item.variants[0].id : null
  )
  const [quantity, setQuantity] = useState(1)

  const hasVariants = item.variants.length > 0
  const needsVariantSelection = hasVariants && !selectedVariantId
  const selectedVariant = item.variants.find((v) => v.id === selectedVariantId) ?? null

  const cardKey = `${item.id}:${selectedVariantId ?? 'none'}`
  const justAdded = addedKey === cardKey

  function handleAdd() {
    if (needsVariantSelection) return
    onAddToCart({
      itemId: item.id,
      variantId: selectedVariantId,
      quantity,
      name: item.name,
      variantLabel: selectedVariant?.label ?? null,
      unitPriceCents: item.price_cents,
      currency: item.currency ?? 'cad',
      imageUrl: item.image_url,
    })
    setQuantity(1)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative w-full aspect-square bg-gray-50 overflow-hidden">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4 flex flex-col flex-1 gap-2.5">
        {/* Name + price */}
        <div>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</h3>
          {item.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{item.description}</p>
          )}
          <p className="text-base font-bold mt-1.5" style={{ color: 'var(--brand-primary)' }}>
            ${(item.price_cents / 100).toFixed(2)}
            <span className="text-xs font-normal text-gray-400 ml-1">{(item.currency ?? 'cad').toUpperCase()}</span>
          </p>
        </div>

        {/* Variant picker */}
        {hasVariants && (
          <select
            value={selectedVariantId ?? ''}
            onChange={(e) => setSelectedVariantId(e.target.value || null)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 bg-white appearance-none cursor-pointer"
          >
            <option value="">Select size</option>
            {item.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={v.stock_quantity === 0}>
                {v.label}{v.stock_quantity === 0 ? ' — Sold out' : v.stock_quantity !== null && v.stock_quantity <= 3 ? ` (${v.stock_quantity} left)` : ''}
              </option>
            ))}
          </select>
        )}

        {/* Qty + add button */}
        <div className="flex items-center gap-2 mt-auto">
          {/* Qty stepper */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-7 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-base leading-none"
              aria-label="Decrease quantity"
            >−</button>
            <span className="w-6 text-center text-xs font-semibold text-gray-800">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(10, q + 1))}
              className="w-7 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-base leading-none"
              aria-label="Increase quantity"
            >+</button>
          </div>

          {/* Add to cart */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={needsVariantSelection}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
              justAdded
                ? 'bg-green-500 text-white scale-95'
                : 'text-white hover:opacity-90 active:scale-95'
            }`}
            style={justAdded ? {} : { backgroundColor: 'var(--brand-primary)' }}
          >
            {justAdded ? '✓ Added' : needsVariantSelection ? 'Pick size' : 'Add to cart'}
          </button>
        </div>
      </div>
    </div>
  )
}
