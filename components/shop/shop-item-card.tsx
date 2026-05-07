'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { ShopItem, MerchVariant } from '@/actions/merchandise'

export type CartItem = {
  itemId: string
  variantId: string | null
  quantity: number
  name: string
  variantLabel: string | null
  unitPriceCents: number
  imageUrl: string | null
}

interface Props {
  item: ShopItem
  onAddToCart: (cartItem: CartItem) => void
}

export function ShopItemCard({ item, onAddToCart }: Props) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    item.variants.length === 1 ? item.variants[0].id : null
  )
  const [quantity, setQuantity] = useState(1)

  const hasVariants = item.variants.length > 0
  const needsVariantSelection = hasVariants && !selectedVariantId
  const selectedVariant: MerchVariant | null =
    item.variants.find((v) => v.id === selectedVariantId) ?? null

  function handleAdd() {
    if (hasVariants && !selectedVariantId) return
    onAddToCart({
      itemId: item.id,
      variantId: selectedVariantId,
      quantity,
      name: item.name,
      variantLabel: selectedVariant?.label ?? null,
      unitPriceCents: item.price_cents,
      imageUrl: item.image_url,
    })
    // Reset to 1 after adding
    setQuantity(1)
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden flex flex-col">
      {/* Image */}
      {item.image_url ? (
        <div className="relative w-full aspect-square bg-gray-50">
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
          <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{item.name}</h3>
          {item.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
          )}
          <p className="text-base font-bold mt-1.5" style={{ color: 'var(--brand-primary)' }}>
            ${(item.price_cents / 100).toFixed(2)} {item.currency.toUpperCase()}
          </p>
        </div>

        {/* Variant picker */}
        {hasVariants && (
          <select
            value={selectedVariantId ?? ''}
            onChange={(e) => setSelectedVariantId(e.target.value || null)}
            className="w-full border rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 bg-white"
          >
            <option value="">Select size / variant</option>
            {item.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
                {v.stock_quantity !== null ? ` (${v.stock_quantity} left)` : ''}
              </option>
            ))}
          </select>
        )}

        {/* Quantity stepper */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="w-8 h-8 rounded-md border flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors text-lg leading-none"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-medium text-gray-900">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(10, q + 1))}
            className="w-8 h-8 rounded-md border flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors text-lg leading-none"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        {/* Add to cart */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={needsVariantSelection}
          className="mt-auto w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {needsVariantSelection ? 'Select a size first' : 'Add to Cart'}
        </button>
      </div>
    </div>
  )
}
