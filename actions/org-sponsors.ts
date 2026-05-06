'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

const sponsorSchema = z.object({
  name: z.string().min(1).max(100),
  website_url: z.string().url().optional().or(z.literal('')),
  tier: z.enum(['gold', 'silver', 'bronze', 'standard']).default('standard'),
})

export async function upsertSponsor(
  id: string | null,
  input: z.infer<typeof sponsorSchema>,
): Promise<{ id: string | null; error: string | null }> {
  const parsed = sponsorSchema.safeParse(input)
  if (!parsed.success) return { id: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  if (id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('org_sponsors')
      .update({ name: parsed.data.name, website_url: parsed.data.website_url || null, tier: parsed.data.tier })
      .eq('id', id)
      .eq('organization_id', org.id)
    if (error) return { id: null, error: error.message }
    revalidatePath('/'); revalidatePath('/admin/settings/website/sponsors')
    return { id, error: null }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: maxRow } = await (db as any)
    .from('org_sponsors').select('display_order').eq('organization_id', org.id)
    .order('display_order', { ascending: false }).limit(1).maybeSingle()
  const display_order = ((maxRow as { display_order: number } | null)?.display_order ?? -1) + 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('org_sponsors')
    .insert({ organization_id: org.id, ...parsed.data, website_url: parsed.data.website_url || null, display_order })
    .select('id').single()
  if (error) return { id: null, error: error.message }
  revalidatePath('/'); revalidatePath('/admin/settings/website/sponsors')
  return { id: (data as { id: string }).id, error: null }
}

export async function deleteSponsor(sponsorId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  // Remove logo from storage if present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (db as any).from('org_sponsors').select('logo_url').eq('id', sponsorId).eq('organization_id', org.id).single()
  if (row?.logo_url) {
    const url: string = row.logo_url
    const prefix = `/org-branding/`
    const pathStart = url.indexOf(prefix)
    if (pathStart !== -1) {
      const path = url.slice(pathStart + prefix.length).split('?')[0]
      await db.storage.from('org-branding').remove([path])
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('org_sponsors').delete().eq('id', sponsorId).eq('organization_id', org.id)
  if (error) return { error: error.message }
  revalidatePath('/'); revalidatePath('/admin/settings/website/sponsors')
  return { error: null }
}

export async function uploadSponsorLogo(
  sponsorId: string,
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file' }
  if (file.size > 2 * 1024 * 1024) return { url: null, error: 'Max 2 MB' }
  if (!['image/jpeg','image/png','image/webp','image/svg+xml'].includes(file.type))
    return { url: null, error: 'JPEG, PNG, WebP, or SVG only' }

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${org.id}/sponsors/${sponsorId}.${ext}`
  const bytes = await file.arrayBuffer()
  const db = createServiceRoleClient()

  const { error: upErr } = await db.storage.from('org-branding').upload(path, bytes, { contentType: file.type, upsert: true })
  if (upErr) return { url: null, error: upErr.message }

  const { data: { publicUrl } } = db.storage.from('org-branding').getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('org_sponsors').update({ logo_url: url }).eq('id', sponsorId).eq('organization_id', org.id)
  revalidatePath('/'); revalidatePath('/admin/settings/website/sponsors')
  return { url, error: null }
}
