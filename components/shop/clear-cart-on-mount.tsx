'use client'

import { useEffect } from 'react'
import { useCart } from './cart-provider'

/**
 * Tiny client component that clears the cart when it first mounts.
 * Used on the shop success page — both Stripe and manual flows land here,
 * but Stripe flow already cleared the cart in CartDrawer; this is a safety net.
 */
export function ClearCartOnMount() {
  const { clearCart } = useCart()

  useEffect(() => {
    clearCart()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
