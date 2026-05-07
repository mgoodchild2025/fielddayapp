import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getMerchandiseItems, getMerchandiseOrders } from '@/actions/merchandise'
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

  const db = createServiceRoleClient()

  const [allItems, leagueMerchRows, orders] = await Promise.all([
    getMerchandiseItems(org.id),
    // Fetch league_merchandise rows directly so we get price_override_cents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('league_merchandise')
      .select('item_id, price_override_cents')
      .eq('league_id', leagueId)
      .then(({ data }: { data: { item_id: string; price_override_cents: number | null }[] | null }) => data ?? []),
    getMerchandiseOrders(leagueId),
  ])

  const enabledItemIds = leagueMerchRows.map(
    (r: { item_id: string; price_override_cents: number | null }) => r.item_id
  )

  // Build a Record<item_id, price_override_cents> for the toggle component
  const enabledItemPrices: Record<string, number | null> = {}
  for (const r of leagueMerchRows as { item_id: string; price_override_cents: number | null }[]) {
    enabledItemPrices[r.item_id] = r.price_override_cents
  }

  return (
    <div className="space-y-10">
      {/* Available Items section */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Available Items</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Toggle which merchandise items players can add during registration for this event.
            You can optionally set a per-event price override for each enabled item.
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
          enabledItemPrices={enabledItemPrices}
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
