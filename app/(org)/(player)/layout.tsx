import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { CartProvider } from '@/components/shop/cart-provider'
import { CartButton } from '@/components/shop/cart-button'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  return (
    <CartProvider>
      {children}
      <MobileBottomNav />
      <CartButton orgId={org.id} />
    </CartProvider>
  )
}
