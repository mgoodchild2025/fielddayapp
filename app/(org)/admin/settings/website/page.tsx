import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { WebsiteSettingsForm } from './website-settings-form'

export default async function WebsiteSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const supabase = await createServerClient()

  const [{ data: branding }, { data: siteContentRows }] = await Promise.all([
    supabase
      .from('org_branding')
      .select('site_theme')
      .eq('organization_id', org.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('org_site_content')
      .select('section_key, content')
      .eq('organization_id', org.id),
  ])

  const contentMap = new Map<string, Record<string, unknown>>(
    (siteContentRows ?? []).map((r: { section_key: string; content: Record<string, unknown> }) => [r.section_key, r.content])
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentTheme = ((branding as any)?.site_theme ?? 'community') as 'community' | 'club' | 'pro'
  const heroContent = (contentMap.get('hero') ?? {}) as {
    headline?: string; subheadline?: string; cta_label?: string; cta_href?: string
  }
  const aboutContent = (contentMap.get('about') ?? {}) as { title?: string; body?: string }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Website</h1>
      <WebsiteSettingsForm
        currentTheme={currentTheme}
        orgSlug={org.slug}
        heroContent={heroContent}
        aboutContent={aboutContent}
      />
    </div>
  )
}
