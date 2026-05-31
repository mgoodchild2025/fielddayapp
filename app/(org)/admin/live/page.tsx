import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getCurrentLiveStream } from '@/actions/live'
import { getYouTubeConnection, listSyncedItems } from '@/actions/social'
import { GoLivePanel } from './go-live-panel'
import { YouTubeSyncPanel } from './youtube-sync-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Go Live — Fieldday' }

export default async function LivePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Live Stream</h1>
        <p className="text-sm text-gray-500 mt-1">
          Surface your YouTube or Instagram live stream on your public site and TV displays.
        </p>
      </div>

      {await canAccess(org.id, 'social_integration') ? (
        <div className="space-y-6">
          <GoLivePanel current={await getCurrentLiveStream(org.id)} />
          <YouTubeSyncPanel
            connection={await getYouTubeConnection(org.id)}
            items={await listSyncedItems(org.id)}
          />
        </div>
      ) : (
        <UpgradePrompt feature="Live streaming" requiredTier="pro" />
      )}
    </div>
  )
}
