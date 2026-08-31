import { NextResponse } from 'next/server'

// Dedicated manifest so the scoreboard installs as its own home-screen app
// (fullscreen, its own name and scope) alongside — not instead of — the
// org-branded Fieldday PWA served by /api/manifest.
export function GET() {
  return NextResponse.json(
    {
      name: 'Fieldday Scoreboard',
      short_name: 'Scoreboard',
      description: 'Tap to score, swipe down to undo. Works offline.',
      start_url: '/scoreboard',
      scope: '/scoreboard',
      display: 'fullscreen',
      background_color: '#0B1210',
      theme_color: '#0B1210',
      icons: [
        { src: '/scoreboard-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/scoreboard-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  )
}
