import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { BrandProvider } from '@/components/branding/brand-provider'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import type { OrgBranding } from '@/types/database'

export const metadata: Metadata = { title: 'Page not found' }

/**
 * The one not-found page: unmatched URLs and every notFound() call. It
 * renders outside the (org) layout, so on an org site it brings its own
 * branding, nav, footer and tab bar — a dead link still looks like the org's
 * site and offers a way on. On the platform apex it's a plain Fieldday page.
 */
export default async function NotFound() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) {
    return (
      <div className="min-h-dvh bg-white">
        <NotFoundCard primary={{ href: '/', label: 'Go to Fieldday' }} />
      </div>
    )
  }

  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const [{ data: branding }, { data: { user } }] = await Promise.all([
    createServiceRoleClient().from('org_branding').select('*').eq('organization_id', org.id).maybeSingle(),
    supabase.auth.getUser(),
  ])
  const b = branding as OrgBranding | null
  const headingFont = b?.heading_font ?? 'Barlow Condensed'
  const bodyFont = b?.body_font ?? 'DM Sans'

  return (
    <>
      <link
        href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@400;600;700&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap`}
        rel="stylesheet"
      />
      <BrandProvider branding={b}>
        <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
          <OrgNav org={org} logoUrl={b?.logo_url ?? null} />
          <NotFoundCard
            primary={user ? { href: '/dashboard', label: 'Go to Home' } : { href: '/events', label: 'Browse events' }}
            secondary={user ? { href: '/events', label: 'Browse events' } : { href: '/', label: `${org.name} home` }}
          />
          <Footer org={org} />
          <MobileBottomNav />
        </div>
      </BrandProvider>
    </>
  )
}

function NotFoundCard({
  primary,
  secondary,
}: {
  primary: { href: string; label: string }
  secondary?: { href: string; label: string }
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-sm text-center">
        <p className="text-5xl font-bold tracking-tight text-brand-primary" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          404
        </p>
        <h1 className="mt-3 text-xl font-bold text-gray-900">We can&apos;t find that page</h1>
        <p className="mt-2 text-sm text-gray-600">
          The link may be old, or the page may have moved or been removed.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={primary.href}
            className="press min-h-11 px-5 rounded-lg bg-brand-primary text-on-brand text-sm font-semibold inline-flex items-center justify-center"
          >
            {primary.label}
          </Link>
          {secondary && (
            <Link
              href={secondary.href}
              className="press min-h-11 px-5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 inline-flex items-center justify-center hover:bg-gray-50"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
