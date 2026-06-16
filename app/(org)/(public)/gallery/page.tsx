import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { GalleryGrid } from '@/components/gallery/gallery-grid'
import { getApprovedVideos } from '@/actions/social'
import { getOrgApprovedEventMedia } from '@/actions/event-media'
import { EventMediaGallery } from '@/components/media/event-media-gallery'

export default async function GalleryPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: branding }, { data: photos }, videos, eventMedia] = await Promise.all([
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('org_photos')
      .select('id, url, caption, display_order')
      .eq('organization_id', org.id)
      .order('display_order', { ascending: true }),
    getApprovedVideos(org.id, 12),
    getOrgApprovedEventMedia(org.id, 60),
  ])

  const photoList = (photos ?? []) as { id: string; url: string; caption: string | null; display_order: number }[]

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Gallery
        </h1>

        {/* Videos — approved YouTube uploads */}
        {videos.length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4">Videos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((v) => (
                <a
                  key={v.id}
                  href={v.media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl overflow-hidden border bg-white shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="relative w-full bg-gray-100" style={{ paddingBottom: '56.25%' }}>
                    {v.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnail_url} alt={v.caption ?? ''} className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center text-white text-xl">▶</span>
                    </span>
                  </div>
                  {v.caption && <p className="px-3 py-2.5 text-sm font-medium leading-snug line-clamp-2">{v.caption}</p>}
                </a>
              ))}
            </div>
          </section>
        )}

        {(photoList.length > 0 || videos.length > 0) && photoList.length > 0 && (
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4">Photos</h2>
        )}
        <GalleryGrid photos={photoList} />

        {/* From events — approved player uploads across all events */}
        {eventMedia.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4">From events</h2>
            <EventMediaGallery items={eventMedia} showLeague />
          </section>
        )}
      </main>

      <Footer org={org} />
    </div>
  )
}
