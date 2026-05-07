import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getShopOrders } from '@/actions/merchandise'
import { MerchandiseOrdersTable } from '@/components/merchandise/merch-orders-table'

export default async function AdminShopPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const orders = await getShopOrders(org.id)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Shop Orders</h1>
        <p className="text-sm text-gray-500 mt-1">
          Merchandise purchased directly through the shop (not tied to event registration).
        </p>
      </div>

      <MerchandiseOrdersTable
        fulfillAllTarget={{ type: 'shop', orgId: org.id }}
        orders={orders}
      />
    </div>
  )
}
