'use client'

import { usePathname } from 'next/navigation'
import { useCart } from './cart-provider'
import { CartDrawer } from './cart-drawer'

interface Props {
  orgId: string
  taxSuffix?: string
}

export function CartButton({ orgId, taxSuffix = '' }: Props) {
  const { totalCount, openCart, isOpen } = useCart()
  const pathname = usePathname()

  // Floating button is only shown on the shop page — elsewhere the nav
  // cart icon is sufficient and the floating button would be redundant.
  const onShopPage = pathname === '/shop' || pathname.startsWith('/shop/')

  return (
    <>
      {totalCount > 0 && !isOpen && onShopPage && (
        <button
          type="button"
          onClick={openCart}
          // Phones: sit 12px above the tab bar (56px + home indicator) — bottom-20
          // left it overlapping the bar on notched phones. The bar is md:hidden.
          className="press fixed bottom-[calc(68px+env(safe-area-inset-bottom,0px))] right-4 md:bottom-6 z-30 flex items-center gap-2 pl-3 pr-4 min-h-11 rounded-full shadow-lg font-semibold text-sm bg-brand-primary text-on-brand"
          aria-label={`View cart (${totalCount} item${totalCount !== 1 ? 's' : ''})`}
        >
          <span className="relative">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
            </svg>
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white text-[10px] font-bold flex items-center justify-center" style={{ color: 'var(--brand-primary-ink, var(--brand-primary))' }}>
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          </span>
          <span>View cart</span>
        </button>
      )}

      <CartDrawer orgId={orgId} taxSuffix={taxSuffix} />
    </>
  )
}
