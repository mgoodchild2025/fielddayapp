'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

// ── Upload a photo ────────────────────────────────────────────────────────────

export async function uploadOrgPhoto(
  formData: FormData,
): Promise<{ id: string | null; url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const file = formData.get('photo') as File | null
  if (!file || file.size === 0) return { id: null, url: null, error: 'No file provided' }
  if (file.size > 5 * 1024 * 1024) return { id: null, url: null, error: 'File must be under 5 MB' }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    return { id: null, url: null, error: 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const path = `${org.id}/${filename}`
  const bytes = await file.arrayBuffer()

  const db = createServiceRoleClient()

  const { error: uploadError } = await db.storage
    .from('org-photos')
    .upload(path, bytes, { contentType: file.type })

  if (uploadError) return { id: null, url: null, error: uploadError.message }

  const { data: { publicUrl } } = db.storage.from('org-photos').getPublicUrl(path)

  // Get current max display_order so new photo goes to the end
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: maxRow } = await (db as any)
    .from('org_photos')
    .select('display_order')
    .eq('organization_id', org.id)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const display_order = ((maxRow as { display_order: number } | null)?.display_order ?? -1) + 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: dbErr } = await (db as any)
    .from('org_photos')
    .insert({ organization_id: org.id, url: publicUrl, display_order })
    .select('id')
    .single()

  if (dbErr) return { id: null, url: null, error: dbErr.message }

  revalidatePath('/')
  revalidatePath('/admin/settings/website/photos')
  return { id: (inserted as { id: string }).id, url: publicUrl, error: null }
}

// ── Update caption ────────────────────────────────────────────────────────────

export async function updatePhotoCaption(
  photoId: string,
  caption: string,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('org_photos')
    .update({ caption: caption || null })
    .eq('id', photoId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath('/')
  revalidatePath('/admin/settings/website/photos')
  return { error: null }
}

// ── Delete a photo ────────────────────────────────────────────────────────────

export async function deleteOrgPhoto(photoId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  // Fetch the row first so we can remove the file from storage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: photo } = await (db as any)
    .from('org_photos')
    .select('url')
    .eq('id', photoId)
    .eq('organization_id', org.id)
    .single()

  if (!photo) return { error: 'Photo not found' }

  // Derive storage path from URL
  const url: string = (photo as { url: string }).url
  const bucketPrefix = `/org-photos/`
  const pathStart = url.indexOf(bucketPrefix)
  if (pathStart !== -1) {
    const storagePath = url.slice(pathStart + bucketPrefix.length).split('?')[0]
    await db.storage.from('org-photos').remove([storagePath])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('org_photos')
    .delete()
    .eq('id', photoId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/admin/settings/website/photos')
  return { error: null }
}

// ── Reorder photos ────────────────────────────────────────────────────────────

const reorderSchema = z.array(z.object({ id: z.string().uuid(), display_order: z.number().int() }))

export async function reorderOrgPhotos(
  items: z.infer<typeof reorderSchema>,
): Promise<{ error: string | null }> {
  const parsed = reorderSchema.safeParse(items)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  // Update each photo's display_order
  await Promise.all(
    parsed.data.map((item) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('org_photos')
        .update({ display_order: item.display_order })
        .eq('id', item.id)
        .eq('organization_id', org.id)
    )
  )

  revalidatePath('/')
  revalidatePath('/admin/settings/website/photos')
  return { error: null }
}
