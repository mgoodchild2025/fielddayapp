import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { WebsiteSettingsForm } from './website-settings-form'

export default async function WebsiteSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const db = createServiceRoleClient()

  const [{ data: branding }, { data: siteContentRows }] = await Promise.all([

    db
      .from('org_branding')
      .select('site_theme')
      .eq('organization_id', org.id)
      .single(),

    db
      .from('org_site_content')
      .select('section_key, content')
      .eq('organization_id', org.id),
  ])

  const contentMap = new Map<string, Record<string, unknown>>(
    (siteContentRows ?? []).map((r) => [r.section_key, (r.content ?? {}) as Record<string, unknown>])
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentTheme = ((branding as any)?.site_theme ?? 'community') as 'community' | 'club' | 'pro'
  const heroContent = (contentMap.get('hero') ?? {}) as {
    headline?: string; subheadline?: string; cta_label?: string; cta_href?: string
  }
  const aboutContent = (contentMap.get('about') ?? {}) as { title?: string; body?: string }
  const sectionLayoutContent = (contentMap.get('section_layout') ?? {}) as {
    sections?: { key: string; visible: boolean }[]
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Website</h1>
      <WebsiteSettingsForm
        currentTheme={currentTheme}
        orgSlug={org.slug}
        heroContent={heroContent}
        aboutContent={aboutContent}
        savedSections={sectionLayoutContent.sections ?? null}
      />
    </div>
  )
}
