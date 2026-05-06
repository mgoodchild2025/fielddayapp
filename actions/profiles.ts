'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { convertToWebP } from '@/lib/image-utils'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export async function uploadPlayerAvatar(
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'Not authenticated' }

  const file = formData.get('avatar') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }
  if (file.size > MAX_SIZE) return { url: null, error: 'File must be under 5 MB' }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, error: 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.' }
  }

  const bytes = await file.arrayBuffer()
  const converted = await convertToWebP(bytes, file.type, { maxWidth: 400, maxHeight: 400 })
  const uploadBytes = converted?.buffer ?? Buffer.from(bytes)
  const uploadType = converted?.contentType ?? file.type
  const ext = converted ? 'webp' : (file.name.split('.').pop()?.toLowerCase() ?? 'jpg')
  const path = `${user.id}/avatar.${ext}`

  const service = createServiceRoleClient()

  // Delete any existing avatar files for this user before uploading the new one.
  // The extension can change between uploads (e.g. jpg → png), so we list the
  // folder and remove all files rather than relying on the upsert overwrite.
  const { data: existing } = await service.storage
    .from('player-avatars')
    .list(user.id)
  if (existing && existing.length > 0) {
    const toRemove = existing.map((f) => `${user.id}/${f.name}`)
    await service.storage.from('player-avatars').remove(toRemove)
  }

  const { error: uploadError } = await service.storage
    .from('player-avatars')
    .upload(path, uploadBytes, { contentType: uploadType, upsert: true })

  if (uploadError) return { url: null, error: uploadError.message }

  const {
    data: { publicUrl },
  } = service.storage.from('player-avatars').getPublicUrl(path)

  const url = `${publicUrl}?t=${Date.now()}`

  // Persist to profiles table
  await service.from('profiles').update({ avatar_url: url }).eq('id', user.id)

  revalidatePath('/profile')
  return { url, error: null }
}
