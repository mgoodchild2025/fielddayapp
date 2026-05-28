import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { PhotoManager } from '@/app/(org)/admin/settings/website/photos/photo-manager'
import Link from 'next/link'

export default async function AdminGalleryPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  if (!await canAccess(org.id, 'media_gallery')) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Gallery</h1>
        <UpgradePrompt feature="Photo gallery & media page" requiredTier="pro" />
      </div>
    )
  }

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: photos } = await (db as any)
    .from('org_photos')
    .select('id, url, caption, display_order, featured')
    .eq('organization_id', org.id)
    .order('display_order', { ascending: true })

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gallery</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload and manage photos. ⭐ Star photos to feature them on your home page.
          </p>
        </div>
        <Link
          href="/gallery"
          target="_blank"
          className="shrink-0 text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-colors"
        >
          View public gallery ↗
        </Link>
      </div>

      <PhotoManager initialPhotos={photos ?? []} />
    </div>
  )
}
