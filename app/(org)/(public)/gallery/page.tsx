import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { GalleryGrid } from '@/components/gallery/gallery-grid'

export default async function GalleryPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: branding }, { data: photos }] = await Promise.all([
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('org_photos')
      .select('id, url, caption, display_order')
      .eq('organization_id', org.id)
      .order('display_order', { ascending: true }),
  ])

  const photoList = (photos ?? []) as { id: string; url: string; caption: string | null; display_order: number }[]

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Gallery
        </h1>
        <GalleryGrid photos={photoList} />
      </main>

      <Footer org={org} />
    </div>
  )
}
