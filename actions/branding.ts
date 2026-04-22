'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const brandingSchema = z.object({
  orgId: z.string().uuid(),
  primary_color: z.string(),
  secondary_color: z.string(),
  bg_color: z.string(),
  text_color: z.string(),
  heading_font: z.string(),
  body_font: z.string(),
  tagline: z.string().optional(),
  contact_email: z.string().optional(),
  custom_domain: z.string().optional(),
  social_instagram: z.string().optional(),
  social_facebook: z.string().optional(),
  social_x: z.string().optional(),
})

export async function updateBranding(input: z.infer<typeof brandingSchema>) {
  const parsed = brandingSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const { orgId, ...brandingData } = parsed.data

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('org_branding')
    .upsert({
      organization_id: orgId,
      ...brandingData,
      tagline: brandingData.tagline || null,
      contact_email: brandingData.contact_email || null,
      custom_domain: brandingData.custom_domain || null,
      social_instagram: brandingData.social_instagram || null,
      social_facebook: brandingData.social_facebook || null,
      social_x: brandingData.social_x || null,
    }, { onConflict: 'organization_id' })

  if (error) return { data: null, error: error.message }

  revalidatePath('/admin/settings/branding')
  revalidatePath('/', 'layout')
  return { data: null, error: null }
}
