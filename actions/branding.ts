'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

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
  timezone: z.string().optional(),
})

export async function updateBranding(input: z.infer<typeof brandingSchema>) {
  const parsed = brandingSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const { orgId, ...brandingData } = parsed.data

  // Verify the caller is an admin of this org
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { data: null, error: 'Unauthorized' }
  }

  // Use service role to bypass RLS (membership already verified above)
  const service = createServiceRoleClient()
  const { error } = await service
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
      timezone: brandingData.timezone || 'America/Toronto',
    }, { onConflict: 'organization_id' })

  if (error) return { data: null, error: error.message }

  revalidatePath('/admin/settings/branding')
  revalidatePath('/', 'layout')
  return { data: null, error: null }
}

const VALID_SOUNDS = new Set(['ding', 'chime', 'beep', 'success', 'airhorn'])

export async function updateCheckinSound(
  orgId: string,
  sound: string | null,
): Promise<{ error: string | null }> {
  if (sound !== null && !VALID_SOUNDS.has(sound)) {
    return { error: 'Invalid sound selection' }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Unauthorized' }
  }

  const service = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (service as any)
    .from('org_branding')
    .upsert({ organization_id: orgId, checkin_sound: sound }, { onConflict: 'organization_id' })

  if (error) return { error: error.message }

  revalidatePath('/admin/settings/branding')
  return { error: null }
}

export async function uploadOrgLogo(formData: FormData): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }
  if (file.size > 2 * 1024 * 1024) return { url: null, error: 'File must be under 2 MB' }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type)) {
    return { url: null, error: 'Unsupported file type' }
  }

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${org.id}/logo.${ext}`
  const bytes = await file.arrayBuffer()

  const service = createServiceRoleClient()

  // Delete any existing logo files before uploading (extension may differ)
  const { data: existing } = await service.storage.from('org-branding').list(org.id)
  if (existing && existing.length > 0) {
    const toRemove = existing.map((f) => `${org.id}/${f.name}`)
    await service.storage.from('org-branding').remove(toRemove)
  }

  const { error: uploadError } = await service.storage
    .from('org-branding')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (uploadError) return { url: null, error: uploadError.message }

  const { data: { publicUrl } } = service.storage.from('org-branding').getPublicUrl(path)

  // Bust the CDN cache by appending a timestamp
  const url = `${publicUrl}?t=${Date.now()}`

  await service
    .from('org_branding')
    .upsert({ organization_id: org.id, logo_url: url }, { onConflict: 'organization_id' })

  revalidatePath('/admin/settings/branding')
  revalidatePath('/', 'layout')
  revalidatePath('/login')

  return { url, error: null }
}
