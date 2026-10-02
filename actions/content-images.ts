'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { assertOrgAdmin } from '@/lib/auth'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export async function uploadContentImage(
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'Not authenticated' }
  // Every rich-text editor is an admin screen — any signed-in user could
  // upload to this public bucket before.
  const org = await getCurrentOrg(await headers())
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { url: null, error: auth.error }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, error: 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.' }
  }

  if (file.size > MAX_SIZE) {
    return { url: null, error: 'Image too large (max 10 MB)' }
  }

  const ext = file.type === 'image/jpeg' ? 'jpg'
    : file.type === 'image/png'  ? 'png'
    : file.type === 'image/webp' ? 'webp'
    : 'gif'

  const path = `${org.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const db = createServiceRoleClient()
  const { error: uploadError } = await db.storage
    .from('content-images')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) return { url: null, error: uploadError.message }

  const { data: { publicUrl } } = db.storage
    .from('content-images')
    .getPublicUrl(path)

  return { url: publicUrl, error: null }
}
