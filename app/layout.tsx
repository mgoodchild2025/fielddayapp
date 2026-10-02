import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from 'sonner'
import { ConfirmHost } from '@/components/ui/confirm-dialog'

// icon.png is picked up automatically by Next.js App Router.
// opengraph-image.png is listed explicitly so we can declare its dimensions
// and ensure the og:image URL is always absolute (required by SMS/social apps).
export const metadata: Metadata = {
  metadataBase: new URL('https://fielddayapp.ca'),
  // Org-branded manifest (name/icon/colors per org) — see app/api/manifest.
  manifest: '/api/manifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Fieldday' },
  title: 'Fieldday — Sports League Management Software',
  description:
    'Run your sports league online: registration and payments (Stripe, e-transfer, GST/HST), scheduling, live standings, playoff brackets, and a branded website for every league.',
  openGraph: {
    title: 'Fieldday — Sports League Management Software',
    description:
      'Online registration, payments, scheduling, standings, and playoff brackets for community sports leagues.',
    url: 'https://fielddayapp.ca',
    siteName: 'Fieldday',
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fieldday — Sports League Management Software',
    description:
      'Online registration, payments, scheduling, standings, and playoff brackets for community sports leagues.',
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
      <body>
        {children}
        {/* One toaster and one confirm host for the whole app (never per page).
            On phones toasts sit above the bottom tab bar. */}
        <Toaster
          position="bottom-center"
          mobileOffset={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
          toastOptions={{ classNames: { actionButton: '!bg-brand-primary !text-on-brand !font-semibold' } }}
        />
        <ConfirmHost />
      </body>
    </html>
  )
}
