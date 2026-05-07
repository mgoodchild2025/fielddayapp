'use client'

import { useCart } from './cart-provider'

export function CartNavIcon() {
  const { totalCount, openCart, isOpen } = useCart()

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={totalCount > 0 ? `Cart (${totalCount} item${totalCount !== 1 ? 's' : ''})` : 'Cart'}
      className="relative flex items-center justify-center w-8 h-8 rounded-md opacity-80 hover:opacity-100 transition-opacity"
    >
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
      </svg>
      {totalCount > 0 && !isOpen && (
        <span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {totalCount > 9 ? '9+' : totalCount}
        </span>
      )}
    </button>
  )
}
