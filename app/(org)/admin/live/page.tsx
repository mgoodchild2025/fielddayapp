import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getActiveLiveStreams } from '@/actions/live'
import { GoLivePanel } from './go-live-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Go Live — Fieldday' }

export default async function LivePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const allowed = await canAccess(org.id, 'social_integration')

  // Events available to attach a stream to (non-archived, not deleted)
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = allowed
    ? await (db as any)
        .from('leagues')
        .select('id, name')
        .eq('organization_id', org.id)
        .is('deleted_at', null)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Go Live</h1>
        <p className="text-sm text-gray-500 mt-1">
          Surface your YouTube or Instagram live stream on your public site and TV displays — org-wide or per event.
        </p>
      </div>

      {allowed ? (
        <GoLivePanel
          events={(events ?? []) as { id: string; name: string }[]}
          activeStreams={await getActiveLiveStreams(org.id)}
        />
      ) : (
        <UpgradePrompt feature="Live streaming" requiredTier="pro" />
      )}
    </div>
  )
}
