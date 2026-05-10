import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getMerchandiseItems } from '@/actions/merchandise'
import { LeagueMerchToggle } from '@/components/merchandise/league-merch-toggle'

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

  const [allItems, leagueMerchRows] = await Promise.all([
    getMerchandiseItems(org.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('league_merchandise')
      .select('item_id, price_override_cents')
      .eq('league_id', leagueId)
      .then(({ data }: { data: { item_id: string; price_override_cents: number | null }[] | null }) => data ?? []),
  ])

  const enabledItemIds = leagueMerchRows.map(
    (r: { item_id: string; price_override_cents: number | null }) => r.item_id
  )

  const enabledItemPrices: Record<string, number | null> = {}
  for (const r of leagueMerchRows as { item_id: string; price_override_cents: number | null }[]) {
    enabledItemPrices[r.item_id] = r.price_override_cents
  }

  return (
    <div className="space-y-6">
      {/* Available Items section */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Available Items</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Toggle which merchandise items players can add during registration for this event.
            You can optionally set a per-event price override for each enabled item.
            Manage your item library in{' '}
            <a href="/admin/shop?tab=items" className="underline hover:opacity-75">
              Shop → Items
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

      {/* Orders link */}
      <section className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-600">
          View merchandise orders for this event in Shop → Orders.
        </p>
        <a
          href="/admin/shop?tab=orders"
          className="shrink-0 text-sm font-medium text-[var(--brand-primary)] hover:opacity-75 transition-opacity"
        >
          View orders ↗
        </a>
      </section>
    </div>
  )
}
