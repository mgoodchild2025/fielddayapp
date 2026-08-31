import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { COMPARISONS, SPORT_PAGES } from '@/lib/marketing-pages'

// Host-aware sitemap. The platform apex lists the marketing + legal pages;
// each org host (subdomain or custom domain) lists its own public pages —
// home, event pages, gallery, and Hall of Champions. Served as a route
// handler (not app/sitemap.ts) because it needs the per-request x-org-id
// header injected by the proxy.

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')
  const host = headersList.get('host') ?? 'fielddayapp.ca'
  const base = `https://${host}`

  const db = createServiceRoleClient()
  const urls: string[] = []

  if (!orgId) {
    // Platform marketing site
    urls.push(`${base}/`, `${base}/canada`, `${base}/scoreboard`, `${base}/legal`)
    for (const c of COMPARISONS) urls.push(`${base}/compare/${c.slug}`)
    for (const s of SPORT_PAGES) urls.push(`${base}/leagues/${s.slug}`)

    const { data: docs } = await db
      .from('legal_documents')
      .select('slug')
      .eq('is_published', true)

    for (const doc of docs ?? []) urls.push(`${base}/legal/${doc.slug}`)
  } else {
    // Org public site — pages viewable without login
    urls.push(`${base}/`, `${base}/gallery`, `${base}/champions`)

    const { data: leagues } = await db
      .from('leagues')
      .select('slug')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .neq('status', 'draft')
      .neq('status', 'archived')
      .limit(500)

    for (const league of leagues ?? []) {
      if (league.slug) urls.push(`${base}/events/${league.slug}`)
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((loc) => `  <url><loc>${xmlEscape(loc)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n')

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
