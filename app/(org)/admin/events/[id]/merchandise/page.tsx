import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getMerchandiseItems, getLeagueMerchandise, getMerchandiseOrders } from '@/actions/merchandise'
import { LeagueMerchToggle } from '@/components/merchandise/league-merch-toggle'
import { MerchandiseOrdersTable } from '@/components/merchandise/merch-orders-table'

export default async function EventMerchandisePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: leagueId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const [allItems, leagueItems, orders] = await Promise.all([
    getMerchandiseItems(org.id),
    getLeagueMerchandise(leagueId),
    getMerchandiseOrders(leagueId),
  ])

  const enabledItemIds = leagueItems.map((i) => i.id)

  return (
    <div className="space-y-10">
      {/* Available Items section */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Available Items</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Toggle which merchandise items players can add during registration for this event.
            Manage your item library in{' '}
            <a href="/admin/settings/merchandise" className="underline hover:opacity-75">
              Settings → Merchandise
            </a>.
          </p>
        </div>
        <LeagueMerchToggle
          leagueId={leagueId}
          allItems={allItems.filter((i) => i.is_active)}
          enabledItemIds={enabledItemIds}
        />
      </section>

      {/* Orders section */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Orders</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            All merchandise orders placed by players registering for this event.
          </p>
        </div>
        <MerchandiseOrdersTable leagueId={leagueId} orders={orders} />
      </section>
    </div>
  )
}
