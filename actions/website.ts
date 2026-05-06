'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

const sectionItemSchema = z.object({ key: z.string(), visible: z.boolean() })

const websiteSettingsSchema = z.object({
  site_theme: z.enum(['community', 'club', 'pro']),
  hero_headline: z.string().max(120).optional(),
  hero_subheadline: z.string().max(200).optional(),
  hero_cta_label: z.string().max(40).optional(),
  hero_cta_href: z.string().max(200).optional(),
  about_title: z.string().max(80).optional(),
  about_body: z.string().max(2000).optional(),
  sections: z.array(sectionItemSchema).optional(),
})

export async function saveWebsiteSettings(input: z.infer<typeof websiteSettingsSchema>) {
  const parsed = websiteSettingsSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const db = createServiceRoleClient()

  // Update site_theme on org_branding (upsert in case row doesn't exist yet)
  const { error: brandingErr } = await db
    .from('org_branding')
    .upsert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { organization_id: org.id, site_theme: parsed.data.site_theme } as any,
      { onConflict: 'organization_id' }
    )
  if (brandingErr) return { error: brandingErr.message }

  const now = new Date().toISOString()

  // Upsert hero + about + section_layout in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsert = (key: string, content: Record<string, unknown>) =>
    (db as any).from('org_site_content').upsert(
      { organization_id: org.id, section_key: key, content, updated_at: now },
      { onConflict: 'organization_id,section_key' }
    )

  const upserts = [
    upsert('hero', {
      headline:    parsed.data.hero_headline    ?? '',
      subheadline: parsed.data.hero_subheadline ?? '',
      cta_label:   parsed.data.hero_cta_label   ?? '',
      cta_href:    parsed.data.hero_cta_href     ?? '',
    }),
    upsert('about', {
      title: parsed.data.about_title ?? '',
      body:  parsed.data.about_body  ?? '',
    }),
    ...(parsed.data.sections
      ? [upsert('section_layout', { sections: parsed.data.sections })]
      : []),
  ]

  const results = await Promise.all(upserts)
  const firstErr = results.find(r => r.error)
  if (firstErr?.error) return { error: firstErr.error.message }

  revalidatePath('/')
  revalidatePath('/admin/settings/website')
  return { error: null }
}
