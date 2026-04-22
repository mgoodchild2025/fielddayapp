import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { BrandProvider } from '@/components/branding/brand-provider'
import type { OrgBranding } from '@/types/database'

export default async function OrgLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = headers()
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
