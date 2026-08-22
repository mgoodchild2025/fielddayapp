'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { convertToWebP } from '@/lib/image-utils'

// ── Broadcast bios (S1) ───────────────────────────────────────────────────────
// Players write their own card; show_on_displays is opt-in (default off).
// Admins can hide a bio without deleting the player's work.

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export interface PlayerBioInput {
  jerseyNumber: string | null
  position: string | null
  hometown: string | null
  yearsPlaying: number | null
  tagline: string | null
  showOnDisplays: boolean
}

export async function saveMyBio(input: PlayerBioInput): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const tagline = input.tagline?.trim().slice(0, 120) || null
  const years = input.yearsPlaying != null && Number.isFinite(input.yearsPlaying)
    ? Math.min(99, Math.max(0, Math.round(input.yearsPlaying)))
    : null

  const db = createServiceRoleClient()
  const { error } = await db.from('player_bios').upsert({
    organization_id: org.id,
    user_id: user.id,
    jersey_number: input.jerseyNumber?.trim().slice(0, 6) || null,
    position: input.position?.trim().slice(0, 40) || null,
    hometown: input.hometown?.trim().slice(0, 60) || null,
    years_playing: years,
    tagline,
    show_on_displays: input.showOnDisplays,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,user_id' })
  if (error) return { error: error.message }

  revalidatePath('/profile')
  return { error: null }
}

/** Card photo: same storage path family as avatars, sized for the big screen. */
export async function uploadBioPhoto(formData: FormData): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'Not authenticated' }

  const file = formData.get('photo') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }
  if (file.size > MAX_SIZE) return { url: null, error: 'File must be under 5 MB' }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, error: 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.' }
  }

  const bytes = await file.arrayBuffer()
  const converted = await convertToWebP(bytes, file.type, { maxWidth: 1000, maxHeight: 1200 })
  const uploadBytes = converted?.buffer ?? Buffer.from(bytes)
  const uploadType = converted?.contentType ?? file.type
  const ext = converted ? 'webp' : (file.name.split('.').pop()?.toLowerCase() ?? 'jpg')
  const path = `${user.id}/bio.${ext}`

  const service = createServiceRoleClient()
  const { error: uploadError } = await service.storage
    .from('player-avatars')
    .upload(path, uploadBytes, { contentType: uploadType, upsert: true })
  if (uploadError) return { url: null, error: uploadError.message }

  const { data: { publicUrl } } = service.storage.from('player-avatars').getPublicUrl(path)
  // Cache-bust: same path is overwritten on re-upload
  const url = `${publicUrl}?v=${Date.now()}`

  await service.from('player_bios').upsert({
    organization_id: org.id,
    user_id: user.id,
    hero_photo_url: url,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,user_id' })

  revalidatePath('/profile')
  return { url, error: null }
}

/** Admin: hide/unhide a bio from displays and cards without deleting it. */
export async function setBioHidden(userId: string, hidden: boolean): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const db = createServiceRoleClient()
  const { error } = await db.from('player_bios')
    .update({ hidden_by_admin: hidden, updated_at: new Date().toISOString() })
    .eq('organization_id', org.id)
    .eq('user_id', userId)
  if (error) return { error: error.message }
  return { error: null }
}
