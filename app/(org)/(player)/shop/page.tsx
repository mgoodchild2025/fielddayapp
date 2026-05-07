import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireAuth } from '@/lib/auth'
import { getShopItems } from '@/actions/merchandise'
import { ShopClient } from '@/components/shop/shop-client'

export default async function ShopPage() {
  await requireAuth()
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const items = await getShopItems(org.id)

  if (items.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-700">No items available</h2>
        <p className="text-sm text-gray-400 mt-1">{org.name} hasn&apos;t added any shop items yet.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shop</h1>
        <p className="text-sm text-gray-500 mt-1">{org.name} merchandise</p>
      </div>
      <ShopClient items={items} orgId={org.id} />
    </div>
  )
}
