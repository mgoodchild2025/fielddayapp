import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getEventMediaForAdmin } from '@/actions/event-media'
import { isCloudinaryConfigured, cloudinaryApiKey, CLOUD_NAME } from '@/lib/cloudinary'
import { EventMediaModeration } from '@/components/media/event-media-moderation'
import { EventMediaUpload } from '@/components/media/event-media-upload'

export default async function EventMediaAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  if (!(await canAccess(org.id, 'media_gallery'))) {
    return <UpgradePrompt feature="Event media gallery" requiredTier="pro" />
  }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('id').eq('id', id).eq('organization_id', org.id).single()
  if (!league) notFound()

  const items = await getEventMediaForAdmin(id)

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Media</h2>
          <p className="text-sm text-gray-500">
            Approve player uploads to publish them to the event gallery, or hide/delete anything unwanted.
          </p>
        </div>
        {isCloudinaryConfigured() && <EventMediaUpload leagueId={id} apiKey={cloudinaryApiKey()} cloudName={CLOUD_NAME} />}
      </div>

      {!isCloudinaryConfigured() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Media uploads aren&rsquo;t configured yet. Set <code>NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME</code>,
          <code> CLOUDINARY_API_KEY</code> and <code>CLOUDINARY_API_SECRET</code> to enable uploads.
        </div>
      )}

      <EventMediaModeration items={items} />
    </div>
  )
}
