import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { COMPARISONS, SPORT_PAGES, MARKETING_CONTENT_UPDATED } from '@/lib/marketing-pages'
import { buildSitemapXml, type SitemapEntry } from '@/lib/sitemap'

// Host-aware sitemap. The platform apex lists the marketing + legal pages;
// each org host (subdomain or custom domain) lists its own public pages —
// home, event pages, gallery, and Hall of Champions. Served as a route
// handler (not app/sitemap.ts) because it needs the per-request x-org-id
// header injected by the proxy.
//
// lastmod comes from real modification dates only: the publish date for legal
// documents, updated_at for events, and MARKETING_CONTENT_UPDATED (bumped by
// hand when marketing copy changes) for the static marketing pages.

export async function GET() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')
  const host = headersList.get('host') ?? 'fielddayapp.ca'
  const base = `https://${host}`

  const db = createServiceRoleClient()
  const entries: SitemapEntry[] = []

  if (!orgId) {
    // Platform marketing site
    const marketing = MARKETING_CONTENT_UPDATED
    entries.push(
      { loc: `${base}/`, lastmod: marketing },
      { loc: `${base}/about`, lastmod: marketing },
      { loc: `${base}/contact`, lastmod: marketing },
      { loc: `${base}/canada`, lastmod: marketing },
      { loc: `${base}/scoreboard`, lastmod: marketing },
      { loc: `${base}/legal`, lastmod: marketing },
    )
    for (const c of COMPARISONS) entries.push({ loc: `${base}/compare/${c.slug}`, lastmod: marketing })
    for (const s of SPORT_PAGES) entries.push({ loc: `${base}/leagues/${s.slug}`, lastmod: marketing })

    const { data: docs } = await db
      .from('legal_documents')
      .select('slug, published_at')
      .eq('is_published', true)

    for (const doc of docs ?? []) {
      entries.push({ loc: `${base}/legal/${doc.slug}`, lastmod: doc.published_at })
    }

    // /privacy renders the privacy policy itself (agents check it directly).
    const privacyDoc = (docs ?? []).find((d: { slug: string }) => d.slug === 'privacy-policy')
    entries.push({ loc: `${base}/privacy`, lastmod: privacyDoc?.published_at ?? marketing })
  } else {
    // Org public site — pages viewable without login
    entries.push(
      { loc: `${base}/` },
      { loc: `${base}/gallery` },
      { loc: `${base}/champions` },
    )

    const { data: leagues } = await db
      .from('leagues')
      .select('slug, updated_at')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .neq('status', 'draft')
      .neq('status', 'archived')
      .limit(500)

    for (const league of leagues ?? []) {
      if (league.slug) entries.push({ loc: `${base}/events/${league.slug}`, lastmod: league.updated_at })
    }
  }

  return new Response(buildSitemapXml(entries), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
