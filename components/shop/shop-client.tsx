'use client'

import { useState } from 'react'
import { ShopItemCard } from './shop-item-card'
import { useCart } from './cart-provider'
import type { CartItem } from './cart-provider'
import type { ShopItem } from '@/actions/merchandise'

interface Props {
  items: ShopItem[]
}

export function ShopClient({ items }: Props) {
  const { addItem, openCart } = useCart()
  const [addedKey, setAddedKey] = useState<string | null>(null)

  function handleAddToCart(item: CartItem) {
    // Only auto-open the cart drawer when the cart was previously empty;
    // subsequent additions just flash "Added ✓" so the user can keep browsing.
    const wasEmpty = items.length === 0
    addItem(item)
    const key = `${item.itemId}:${item.variantId ?? 'none'}`
    setAddedKey(key)
    setTimeout(() => {
      setAddedKey(null)
      if (wasEmpty) openCart()
    }, 600)
  }

  return (
    // Equal-height cards at every breakpoint for a uniform grid.
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 items-stretch">
      {items.map((item) => (
        <ShopItemCard
          key={item.id}
          item={item}
          onAddToCart={handleAddToCart}
          addedKey={addedKey}
        />
      ))}
    </div>
  )
}
