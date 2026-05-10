'use client'

import Link from 'next/link'

interface Props {
  activeTab: 'items' | 'orders'
}

export function ShopTabs({ activeTab }: Props) {
  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-6">
        <Link
          href="/admin/shop?tab=orders"
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'orders'
              ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Orders
        </Link>
        <Link
          href="/admin/shop?tab=items"
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'items'
              ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Items
        </Link>
      </nav>
    </div>
  )
}
