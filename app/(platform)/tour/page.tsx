import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Barlow, Big_Shoulders, Chakra_Petch } from 'next/font/google'
import { GameNightTour } from '@/components/marketing/tour/game-night-tour'

// Game Night — an animated, first-person tour of Fieldday for the marketing
// site. Under test: kept out of search results and the sitemap until it has
// proven itself against the homepage.

// Variable font: the opsz axis gives the tall display cut at headline sizes.
const display = Big_Shoulders({ subsets: ['latin'], axes: ['opsz'], variable: '--tour-display', display: 'swap', adjustFontFallback: false })
const body = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--tour-body', display: 'swap' })
const hud = Chakra_Petch({ subsets: ['latin'], weight: ['500', '600'], variable: '--tour-hud', display: 'swap' })

export const metadata: Metadata = {
  title: 'Game Night — a tour of Fieldday',
  description:
    'Run through a night of rec sports and see how Fieldday handles registration, scoring, scheduling, standings, payments, playoffs and medals.',
  robots: { index: false, follow: true },
  openGraph: {
    title: 'Game Night — a tour of Fieldday',
    description: 'A first-person run through a night of rec sports, and the league software behind it.',
    // Next's metadata merge is shallow: re-declare the card image.
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#05070d',
}

export default async function TourPage() {
  // Marketing only — org sites have their own home page.
  const headersList = await headers()
  if (headersList.get('x-org-id')) notFound()

  return (
    <GameNightTour
      className={`${display.variable} ${body.variable} ${hud.variable}`}
      fonts={{ display: display.style.fontFamily, body: body.style.fontFamily, hud: hud.style.fontFamily }}
    />
  )
}
