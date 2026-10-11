import { NextResponse } from 'next/server'
import { displayByToken, doorOrgId } from '@/lib/door/service'

/** Per-display web app manifest: the installed app reopens this display. */
export async function GET(_request: Request, { params }: { params: Promise<{ displayToken: string }> }) {
  const { displayToken } = await params
  const orgId = await doorOrgId()
  if (!orgId) return new NextResponse('Not found', { status: 404 })
  const found = await displayByToken(orgId, displayToken)
  if (found.kind !== 'ok') return new NextResponse('Not found', { status: 404 })

  return NextResponse.json(
    {
      name: `${found.station.name} — Door alert`,
      short_name: 'Door',
      id: `/door/display/${found.display.id}`,
      start_url: `/door/display/${displayToken}`,
      scope: '/door/',
      display: 'standalone',
      background_color: '#0B0B0C',
      theme_color: '#0B0B0C',
      icons: [
        { src: '/api/org-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/api/org-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/api/org-icon?size=512&maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  )
}
