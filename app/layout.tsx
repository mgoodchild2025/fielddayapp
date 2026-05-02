import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fieldday',
  description: 'Sports league management, built for your community.',

  icons: {
    icon: '/Fieldday-Icon.png',
    apple: '/Fieldday-Icon.png',
  },

  openGraph: {
    type: 'website',
    title: 'Fieldday',
    description: 'Sports league management, built for your community.',
    images: [{ url: '/Fieldday-og.png', alt: 'Fieldday' }],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Fieldday',
    description: 'Sports league management, built for your community.',
    images: ['/Fieldday-og.png'],
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
