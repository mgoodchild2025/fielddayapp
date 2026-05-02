import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { BrandProvider } from '@/components/branding/brand-provider'
import type { OrgBranding } from '@/types/database'

// ── Dynamic metadata per org ─────────────────────────────────────────────────
// Sets the browser-tab favicon and Open Graph / Twitter Card tags so links
// shared on social media show the org logo and name automatically.
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) {
    return { title: 'Fieldday', description: 'Sports league management platform' }
  }

  const supabase = await createServerClient()
  const [{ data: org }, { data: branding }] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', orgId).single(),
    supabase.from('org_branding')
      .select('logo_url, tagline, hero_image_url')
      .eq('organization_id', orgId)
      .single(),
  ])

  const orgName = org?.name ?? 'Fieldday'
  const logoUrl = branding?.logo_url ?? null
  const heroUrl = branding?.hero_image_url ?? null
  const description = branding?.tagline ?? `${orgName} — sports league management`

  // Prefer a landscape hero for the OG card (richer preview); fall back to logo
  const ogImage = heroUrl ?? logoUrl

  return {
    // Child pages set their own title; this provides the suffix template
    title: {
      default: orgName,
      template: `%s — ${orgName}`,
    },
    description,

    // Favicon — org logo if uploaded, otherwise Fieldday platform icon
    icons: {
      icon: logoUrl ?? '/Fieldday-Icon.png',
      apple: logoUrl ?? '/Fieldday-Icon.png',
    },

    // Open Graph — Facebook, iMessage, Slack, Discord, etc.
    ...(ogImage && {
      openGraph: {
        type: 'website',
        title: orgName,
        description,
        images: [{ url: ogImage, alt: orgName }],
      },
      // Twitter / X card
      twitter: {
        // summary_large_image when we have a landscape hero; summary (square) for logo-only
        card: heroUrl ? 'summary_large_image' : 'summary',
        title: orgName,
        description,
        images: [ogImage],
      },
    }),
  }
}

export default async function OrgLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  // No org context = marketing domain (fielddayapp.ca) — render without org branding
  if (!orgId) {
    return <>{children}</>
  }

  const supabase = await createServerClient()
  const { data: branding } = await supabase
    .from('org_branding')
    .select('*')
    .eq('organization_id', orgId)
    .single()

  const headingFont = branding?.heading_font ?? 'Barlow Condensed'
  const bodyFont = branding?.body_font ?? 'DM Sans'
  const googleFontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@400;600;700&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap`

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href={googleFontsUrl} rel="stylesheet" />
      <BrandProvider branding={branding as OrgBranding | null}>
        {children}
      </BrandProvider>
    </>
  )
}
