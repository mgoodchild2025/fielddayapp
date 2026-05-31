import Link from 'next/link'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getYouTubeConnection, listSyncedItems } from '@/actions/social'
import { YouTubeSyncPanel } from './youtube-sync-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Integrations — Settings' }

export default async function IntegrationsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  return (
    <div className="max-w-2xl">
      <div className="mb-1 text-sm text-gray-400">
        <Link href="/admin/settings" className="hover:text-gray-600 transition-colors">Settings</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-700 font-medium">Integrations</span>
      </div>
      <h1 className="text-2xl font-bold mb-1">Integrations</h1>
      <p className="text-sm text-gray-500 mb-6">
        Connect your social accounts so Fieldday can surface your videos and detect live streams.
        To broadcast right now, use <Link href="/admin/live" className="underline">Go Live</Link>.
      </p>

      {await canAccess(org.id, 'social_integration') ? (
        <div className="space-y-6">
          <YouTubeSyncPanel
            connection={await getYouTubeConnection(org.id)}
            items={await listSyncedItems(org.id)}
          />

          {/* Future connections */}
          <div className="bg-white rounded-lg border p-5 opacity-60">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Instagram &amp; TikTok</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Connect your account to sync your posts. Coming soon.
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">Coming soon</span>
            </div>
          </div>
        </div>
      ) : (
        <UpgradePrompt feature="Social integrations" requiredTier="pro" />
      )}
    </div>
  )
}
