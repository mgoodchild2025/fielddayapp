import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { BrandProvider } from '@/components/branding/brand-provider'
import { CartProvider } from '@/components/shop/cart-provider'
import { CartButton } from '@/components/shop/cart-button'
import { MaintenancePage } from '@/components/maintenance-page'
import { HibernatePage } from '@/components/hibernate-page'
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

  const db = createServiceRoleClient()
  const [{ data: org }, { data: branding }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('organizations').select('name').eq('id', orgId).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding')
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
  const db2 = createServiceRoleClient()
  const [
    { data: branding },
    { data: { user } },
    { data: orgRow },
    { data: platformSettings },
    { data: subscriptionRow },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db2 as any).from('org_branding').select('*').eq('organization_id', orgId).single(),
    supabase.auth.getUser(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db2 as any)
      .from('organizations')
      .select('name, maintenance_mode, maintenance_message, maintenance_until')
      .eq('id', orgId)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db2 as any)
      .from('platform_settings')
      .select('key, value')
      .in('key', ['maintenance_mode_all', 'maintenance_mode_message', 'maintenance_mode_until']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db2 as any)
      .from('subscriptions')
      .select('status, hibernate_until')
      .eq('organization_id', orgId)
      .single(),
  ])

  // ── Maintenance gate ────────────────────────────────────────────────────────
  const settingsMap = new Map(
    ((platformSettings ?? []) as { key: string; value: string }[]).map(r => [r.key, r.value])
  )
  const globalOn = settingsMap.get('maintenance_mode_all') === 'true'
  const orgOn = orgRow?.maintenance_mode === true
  const isHibernating = subscriptionRow?.status === 'hibernating'

  // Admin/auth/api routes must stay reachable when an org is hibernating so the
  // org admin can log in and resume the account (and so client/server actions
  // still work). Public pages still show the off-season page.
  const pathname = headersList.get('x-pathname') ?? ''
  const isPrivilegedRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api')

  // Check platform_role for bypass — needed for maintenance and hibernation gates
  let isPlatformAdmin = false
  if ((globalOn || orgOn || isHibernating) && user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (db2 as any)
      .from('profiles')
      .select('platform_role')
      .eq('id', user.id)
      .single()
    isPlatformAdmin = profile?.platform_role === 'platform_admin'
  }

  if ((globalOn || orgOn) && !isPlatformAdmin) {
    const message = globalOn
      ? (settingsMap.get('maintenance_mode_message') ?? null)
      : (orgRow?.maintenance_message ?? null)
    const until = globalOn
      ? (settingsMap.get('maintenance_mode_until') ?? null)
      : (orgRow?.maintenance_until ?? null)
    const timezone = (branding as OrgBranding | null)?.timezone ?? 'America/Toronto'

    return (
      <>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <BrandProvider branding={branding as OrgBranding | null}>
          <MaintenancePage
            message={message}
            until={until}
            branding={branding as OrgBranding | null}
            timezone={timezone}
          />
        </BrandProvider>
      </>
    )
  }

  // ── Hibernate gate ──────────────────────────────────────────────────────────
  // Hibernating orgs show a seasonal off-season page to public visitors. Admin,
  // login, and API routes are exempt so an org admin can sign in and resume the
  // account (the admin layout handles its own auth). Platform admins bypass entirely.
  if (isHibernating && !isPlatformAdmin && !isPrivilegedRoute) {
    const timezone = (branding as OrgBranding | null)?.timezone ?? 'America/Toronto'
    return (
      <>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <BrandProvider branding={branding as OrgBranding | null}>
          <HibernatePage
            orgName={orgRow?.name ?? 'This organization'}
            resumeAt={subscriptionRow?.hibernate_until ?? null}
            branding={branding as OrgBranding | null}
            timezone={timezone}
          />
        </BrandProvider>
      </>
    )
  }

  const headingFont = branding?.heading_font ?? 'Barlow Condensed'
  const bodyFont = branding?.body_font ?? 'DM Sans'
  const googleFontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@400;600;700&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap`

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href={googleFontsUrl} rel="stylesheet" />
      <BrandProvider branding={branding as OrgBranding | null}>
        <CartProvider orgId={orgId} userId={user?.id ?? null}>
          {children}
          {user && <CartButton orgId={orgId} />}
        </CartProvider>
      </BrandProvider>
    </>
  )
}
