import Link from 'next/link'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { PhotoManager } from './photo-manager'

export default async function PhotosPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: photos } = await (db as any)
    .from('org_photos')
    .select('id, url, caption, display_order')
    .eq('organization_id', org.id)
    .order('display_order', { ascending: true })

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/settings/website" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← Website
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-2xl font-bold">Photo Gallery</h1>
      </div>

      <PhotoManager initialPhotos={photos ?? []} />
    </div>
  )
}
