import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getAllMerchandiseOrders, getMerchandiseItems } from '@/actions/merchandise'
import type { MerchItem } from '@/actions/merchandise'
import { MerchandiseOrdersTable } from '@/components/merchandise/merch-orders-table'
import { MerchItemList } from '@/components/merchandise/merch-item-list'
import { ShopTabs } from '@/components/merchandise/shop-tabs'

function getLowStockAlerts(items: MerchItem[]) {
  const out: string[] = []
  const low: string[] = []

  for (const item of items.filter((i) => i.is_active)) {
    if (item.variants.length > 0) {
      const tracked = item.variants.filter((v) => v.stock_quantity !== null)
      for (const v of tracked) {
        const label = `${item.name} (${v.label})`
        if (v.stock_quantity! <= 0) out.push(label)
        else if (v.stock_quantity! <= item.low_stock_threshold) low.push(label)
      }
    } else if (item.stock_quantity !== null) {
      if (item.stock_quantity <= 0) out.push(item.name)
      else if (item.stock_quantity <= item.low_stock_threshold) low.push(item.name)
    }
  }

  return { out, low }
}

export default async function AdminShopPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab = tab === 'items' ? 'items' : 'orders'

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const [orders, items] = await Promise.all([
    getAllMerchandiseOrders(org.id),
    getMerchandiseItems(org.id),
  ])

  const { out, low } = getLowStockAlerts(items)
  const hasAlerts = out.length > 0 || low.length > 0

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Shop</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your merchandise catalogue and view all orders.
        </p>
      </div>

      <ShopTabs activeTab={activeTab} />

      {activeTab === 'items' ? (
        <div className="space-y-6">
          {/* Low-stock / out-of-stock banner */}
          {hasAlerts && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${out.length > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div className="flex-1 min-w-0">
                  {out.length > 0 && (
                    <p className="font-medium">
                      {out.length === 1
                        ? `"${out[0]}" is out of stock`
                        : `${out.length} items are out of stock`}
                      {out.length <= 3 && out.length > 1 && (
                        <span className="font-normal">: {out.join(', ')}</span>
                      )}
                    </p>
                  )}
                  {low.length > 0 && (
                    <p className={out.length > 0 ? 'mt-0.5' : 'font-medium'}>
                      {out.length === 0 && (
                        <>
                          {low.length === 1
                            ? `"${low[0]}" is running low`
                            : `${low.length} items are running low`}
                          {low.length <= 3 && low.length > 1 && (
                            <span className="font-normal">: {low.join(', ')}</span>
                          )}
                        </>
                      )}
                      {out.length > 0 && low.length > 0 && (
                        <span className="font-normal">
                          {low.length} more {low.length === 1 ? 'item is' : 'items are'} running low
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-xs mt-0.5 opacity-75">Update stock quantities below to restock items or adjust thresholds.</p>
                </div>
              </div>
            </div>
          )}

          <MerchItemList items={items} />
        </div>
      ) : (
        <MerchandiseOrdersTable
          fulfillAllTarget={{ type: 'all', orgId: org.id }}
          orders={orders}
          showSource
        />
      )}
    </div>
  )
}
