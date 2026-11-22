'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ShopItemCard } from './shop-item-card'
import { useCart } from './cart-provider'
import type { CartItem } from './cart-provider'
import type { ShopItem } from '@/actions/merchandise'

interface Props {
  items: ShopItem[]
  /** Signed-out visitors browse freely; adding sends them to sign in first. */
  signedIn: boolean
}

/** `?add=<itemId>.<variantId|>.<qty>` — the pick a visitor made before signing in. */
const encodePick = (c: CartItem) => `${c.itemId}.${c.variantId ?? ''}.${c.quantity}`

function decodePick(raw: string | null, items: ShopItem[]): CartItem | null {
  const m = raw?.match(/^([0-9a-f-]{36})\.([0-9a-f-]{36})?\.(\d{1,2})$/i)
  if (!m) return null
  const item = items.find((i) => i.id === m[1])
  if (!item) return null
  const variant = m[2] ? item.variants.find((v) => v.id === m[2]) ?? null : null
  if (m[2] ? !variant : item.variants.length > 0) return null
  if (variant?.stock_quantity === 0) return null
  return {
    itemId: item.id,
    variantId: variant?.id ?? null,
    quantity: Math.min(10, Math.max(1, Number(m[3]))),
    name: item.name,
    variantLabel: variant?.label ?? null,
    unitPriceCents: item.price_cents,
    currency: item.currency ?? 'cad',
    imageUrl: item.image_url,
  }
}

export function ShopClient({ items, signedIn }: Props) {
  const { addItem, openCart, totalCount, isLoading } = useCart()
  const [addedKey, setAddedKey] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function handleAddToCart(item: CartItem) {
    if (!signedIn) {
      // Sign in (or create a free account) and come back with this in the cart.
      const back = `${pathname}?add=${encodePick(item)}`
      router.push(`/login?redirect=${encodeURIComponent(back)}`)
      return
    }
    // Only auto-open the cart drawer when the cart was previously empty;
    // subsequent additions just flash "Added ✓" so the user can keep browsing.
    // (It checked the shop's item list, which is never empty here — so the
    // drawer never opened.)
    const wasEmpty = totalCount === 0
    addItem(item)
    const key = `${item.itemId}:${item.variantId ?? 'none'}`
    setAddedKey(key)
    setTimeout(() => {
      setAddedKey(null)
      if (wasEmpty) openCart()
    }, 600)
  }

  // Back from sign-in with a pick: add it once the saved cart has loaded (so
  // it merges with what's there), then drop the parameter.
  const handledPick = useRef(false)
  useEffect(() => {
    if (!signedIn || isLoading || handledPick.current) return
    const raw = params.get('add')
    if (!raw) return
    handledPick.current = true
    const pick = decodePick(raw, items)
    router.replace(pathname, { scroll: false })
    if (!pick) return
    addItem(pick)
    openCart()
  }, [signedIn, isLoading, params, items, addItem, openCart, router, pathname])

  return (
    <>
      {!signedIn && (
        <p className="mb-5 rounded-lg bg-white border px-4 py-3 text-sm text-gray-600">
          Anyone can shop here. When you add something, you&apos;ll sign in or create a free account so we can get your order to you.
        </p>
      )}
      {/* Equal-height cards at every breakpoint for a uniform grid. */}
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
    </>
  )
}
