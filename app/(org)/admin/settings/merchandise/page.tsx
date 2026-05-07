import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getMerchandiseItems } from '@/actions/merchandise'
import { MerchItemList } from '@/components/merchandise/merch-item-list'

export default async function MerchandiseSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const items = await getMerchandiseItems(org.id)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Merchandise</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Create and manage merchandise items — jerseys, hats, bags — that can be offered to players
          during event registration. Once created, enable each item per event from the event&apos;s
          Merchandise tab.
        </p>
      </div>

      <MerchItemList items={items} />
    </div>
  )
}
