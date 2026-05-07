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
    addItem(item)
    // Flash "Added" feedback on the card, then open the drawer after a beat
    const key = `${item.itemId}:${item.variantId ?? 'none'}`
    setAddedKey(key)
    setTimeout(() => {
      setAddedKey(null)
      openCart()
    }, 600)
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
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
