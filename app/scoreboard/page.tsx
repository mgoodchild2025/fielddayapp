import type { Metadata, Viewport } from 'next'
import { ScoreboardApp } from '@/components/scoreboard/scoreboard-app'

// Free standalone scoreboard — no login, works on every host (apex and org
// sites), installable as its own PWA, offline once visited. Canonical points
// at the apex so org-host copies never register as duplicate content.

export const metadata: Metadata = {
  title: 'Free Scoreboard App — Fieldday',
  description:
    'A free scoreboard for volleyball, basketball, and any court sport. Tap to score, swipe down to undo, set-by-set tracking. Works offline — add it to your home screen.',
  alternates: { canonical: 'https://fielddayapp.ca/scoreboard' },
  manifest: '/scoreboard/manifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Scoreboard' },
  openGraph: {
    title: 'Free Scoreboard App — Fieldday',
    description: 'Tap to score, swipe down to undo, works offline. Free from Fieldday.',
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0B1210',
}

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Fieldday Scoreboard',
  url: 'https://fielddayapp.ca/scoreboard',
  applicationCategory: 'SportsApplication',
  operatingSystem: 'Any',
  description:
    'A free web scoreboard for volleyball, basketball, and any court sport. Tap to score, swipe down to undo, set-by-set tracking, works offline.',
  offers: { '@type': 'Offer', price: 0, priceCurrency: 'CAD' },
  publisher: { '@type': 'Organization', name: 'Fieldday Sports Technology Inc.', url: 'https://fielddayapp.ca' },
}

export default function ScoreboardPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <ScoreboardApp />
    </>
  )
}
