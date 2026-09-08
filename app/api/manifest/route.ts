import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'

/**
 * Org-branded web app manifest — makes each org's site installable to a phone
 * home screen under its own name, icon, and colors. Served as a route handler
 * (not app/manifest.ts) because it needs the per-request x-org-id header.
 * Hosts without an org (platform apex) get the generic Fieldday manifest.
 */
export async function GET() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  let name = 'Fieldday'
  let themeColor = '#1F2731'
  let logoUrl: string | null = null

  if (orgId) {
    const db = createServiceRoleClient()
    const [{ data: org }, { data: branding }] = await Promise.all([
      db.from('organizations').select('name').eq('id', orgId).maybeSingle(),
      db.from('org_branding').select('logo_url, primary_color').eq('organization_id', orgId).maybeSingle(),
    ])
    if (org?.name) name = org.name
    if (branding?.primary_color) themeColor = branding.primary_color
    logoUrl = branding?.logo_url ?? null
  }

  const manifest = {
    name,
    short_name: name.length > 12 ? name.split(' ')[0] : name,
    description: 'Schedules, standings, and registration.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColor,
    icons: [
      // The org's own logo first (best-effort — any size), then the Fieldday
      // icons at the sizes install prompts require.
      ...(logoUrl ? [{ src: logoUrl, sizes: 'any' }] : []),
      { src: '/Fieldday-Icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/Fieldday-Icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the home-screen icon (Android/desktop; iOS ignores these).
    shortcuts: [
      { name: 'My schedule', url: '/schedule', icons: [{ src: '/Fieldday-Icon.png', sizes: '192x192' }] },
      { name: 'Standings', url: '/standings', icons: [{ src: '/Fieldday-Icon.png', sizes: '192x192' }] },
      { name: 'Scoreboard', url: '/scoreboard', icons: [{ src: '/scoreboard-icon-192.png', sizes: '192x192' }] },
    ],
    // Org sites accept photos/videos from the phone's share sheet. The root
    // service worker intercepts the POST (app/sw.js) and /share finishes the
    // upload into the event media queue.
    ...(orgId ? {
      share_target: {
        action: '/share/inbox',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: { title: 'title', text: 'text', files: [{ name: 'media', accept: ['image/*', 'video/*'] }] },
      },
    } : {}),
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Branding changes rarely; let browsers cache for an hour.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
