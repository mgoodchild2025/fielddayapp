import type { Metadata, Viewport } from 'next'
import './globals.css'

// icon.png and opengraph-image.png in this directory are picked up
// automatically by Next.js App Router — no need to list them here.
export const metadata: Metadata = {
  title: 'Fieldday',
  description: 'Sports league management, built for your community.',
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
