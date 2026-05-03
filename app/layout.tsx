import type { Metadata, Viewport } from 'next'
import './globals.css'

// icon.png is picked up automatically by Next.js App Router.
// opengraph-image.png is listed explicitly so we can declare its dimensions
// and ensure the og:image URL is always absolute (required by SMS/social apps).
export const metadata: Metadata = {
  metadataBase: new URL('https://fielddayapp.ca'),
  title: 'Fieldday',
  description: 'Sports league management, built for your community.',
  openGraph: {
    title: 'Fieldday',
    description: 'Sports league management, built for your community.',
    url: 'https://fielddayapp.ca',
    siteName: 'Fieldday',
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fieldday',
    description: 'Sports league management, built for your community.',
    images: ['/opengraph-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
