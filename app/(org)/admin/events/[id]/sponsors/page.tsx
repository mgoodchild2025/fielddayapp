import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getEventSponsorPageData } from '@/actions/event-sponsors'
import { EventSponsorManager } from '@/components/sponsors/event-sponsor-manager'

export default async function EventSponsorsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: leagueId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const data = await getEventSponsorPageData(leagueId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Sponsors</h1>
        <p className="text-sm text-gray-500 mt-1">
          Advertise sponsors on this event — including the running banner on the TV display.
          Link existing org sponsors or add event-only ones.
        </p>
      </div>

      <EventSponsorManager
        leagueId={leagueId}
        showOrgSponsors={data.showOrgSponsors}
        links={data.links}
        orgSponsors={data.orgSponsors}
        linkedSponsorIds={data.linkedSponsorIds}
      />
    </div>
  )
}
