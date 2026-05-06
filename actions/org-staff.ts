'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { convertToWebP } from '@/lib/image-utils'

const staffSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().max(80).optional(),
  bio: z.string().max(500).optional(),
})

export async function upsertStaffMember(
  id: string | null,
  input: z.infer<typeof staffSchema>,
): Promise<{ id: string | null; error: string | null }> {
  const parsed = staffSchema.safeParse(input)
  if (!parsed.success) return { id: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  if (id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('org_staff')
      .update({ name: parsed.data.name, role: parsed.data.role || null, bio: parsed.data.bio || null })
      .eq('id', id).eq('organization_id', org.id)
    if (error) return { id: null, error: error.message }
    revalidatePath('/'); revalidatePath('/admin/settings/website/staff')
    return { id, error: null }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: maxRow } = await (db as any)
    .from('org_staff').select('display_order').eq('organization_id', org.id)
    .order('display_order', { ascending: false }).limit(1).maybeSingle()
  const display_order = ((maxRow as { display_order: number } | null)?.display_order ?? -1) + 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('org_staff')
    .insert({ organization_id: org.id, ...parsed.data, role: parsed.data.role || null, bio: parsed.data.bio || null, display_order })
    .select('id').single()
  if (error) return { id: null, error: error.message }
  revalidatePath('/'); revalidatePath('/admin/settings/website/staff')
  return { id: (data as { id: string }).id, error: null }
}

export async function deleteStaffMember(staffId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('org_staff').delete().eq('id', staffId).eq('organization_id', org.id)
  if (error) return { error: error.message }
  revalidatePath('/'); revalidatePath('/admin/settings/website/staff')
  return { error: null }
}

export async function uploadStaffAvatar(
  staffId: string,
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const file = formData.get('avatar') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file' }
  if (file.size > 2 * 1024 * 1024) return { url: null, error: 'Max 2 MB' }
  if (!['image/jpeg','image/png','image/webp'].includes(file.type))
    return { url: null, error: 'JPEG, PNG, or WebP only' }

  const bytes = await file.arrayBuffer()
  const converted = await convertToWebP(bytes, file.type, { maxWidth: 400, maxHeight: 400 })
  const uploadBytes = converted?.buffer ?? Buffer.from(bytes)
  const uploadType = converted?.contentType ?? file.type
  const ext = converted ? 'webp' : (file.name.split('.').pop() ?? 'jpg')
  const path = `${org.id}/staff/${staffId}.${ext}`
  const db = createServiceRoleClient()

  const { error: upErr } = await db.storage.from('org-branding').upload(path, uploadBytes, { contentType: uploadType, upsert: true })
  if (upErr) return { url: null, error: upErr.message }

  const { data: { publicUrl } } = db.storage.from('org-branding').getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('org_staff').update({ avatar_url: url }).eq('id', staffId).eq('organization_id', org.id)
  revalidatePath('/'); revalidatePath('/admin/settings/website/staff')
  return { url, error: null }
}
