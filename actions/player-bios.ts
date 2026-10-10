'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { convertToWebP } from '@/lib/image-utils'
import { createNotifications } from '@/lib/notify'
import { cardGaps, describeGaps } from '@/lib/player-card-gaps'

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

/**
 * The quick card on the registration success page: number and position only.
 * Writes ONLY the keys it's given (an upsert's update touches only the sent
 * columns), so a player with a full bio never loses their tagline, photo or
 * display opt-in by filling this in.
 */
export async function saveMyCardBasics(input: { jerseyNumber?: unknown; position?: unknown }): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again.' }

  const row: { jersey_number?: string; position?: string } = {}
  if (typeof input.jerseyNumber === 'string' && input.jerseyNumber.trim()) row.jersey_number = input.jerseyNumber.trim().slice(0, 6)
  if (typeof input.position === 'string' && input.position.trim()) row.position = input.position.trim().slice(0, 40)
  if (Object.keys(row).length === 0) return { error: 'Add your number or position first.' }

  const db = createServiceRoleClient()
  const { error } = await db.from('player_bios').upsert({
    organization_id: org.id,
    user_id: user.id,
    ...row,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,user_id' })
  if (error) return { error: "Couldn't save your card. Try again from your profile." }

  revalidatePath('/profile')
  revalidatePath('/dashboard')
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

  const { error: dbError } = await service.from('player_bios').upsert({
    organization_id: org.id,
    user_id: user.id,
    hero_photo_url: url,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,user_id' })
  if (dbError) return { url: null, error: dbError.message }

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

/**
 * Captain/coach: ask teammates whose cards are incomplete to finish them.
 * One notification per player per season (league): asking twice turns a
 * friendly nudge into nagging, so already-nudged players are skipped.
 */
export async function nudgeTeamCards(teamId: string): Promise<{ error: string | null; sent: number; alreadyNudged: number }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again.', sent: 0, alreadyNudged: 0 }

  const db = createServiceRoleClient()
  const [{ data: team }, { data: me }] = await Promise.all([
    db.from('teams').select('id, name, league_id').eq('id', teamId).eq('organization_id', org.id).maybeSingle(),
    db.from('team_members').select('role').eq('team_id', teamId).eq('user_id', user.id).eq('status', 'active').maybeSingle(),
  ])
  if (!team) return { error: 'Team not found.', sent: 0, alreadyNudged: 0 }
  if (!me || !['captain', 'coach'].includes(me.role ?? '')) {
    return { error: 'Only the captain or coach can nudge the team.', sent: 0, alreadyNudged: 0 }
  }

  const { data: members } = await db
    .from('team_members')
    .select('user_id, position, profile:profiles!team_members_user_id_fkey(avatar_url)')
    .eq('team_id', teamId)
    .eq('status', 'active')
  const others = (members ?? []).filter((m): m is typeof m & { user_id: string } => !!m.user_id && m.user_id !== user.id)
  if (others.length === 0) return { error: null, sent: 0, alreadyNudged: 0 }

  const ids = others.map((m) => m.user_id)
  const [{ data: bios }, { data: earlier }, { data: myProfile }] = await Promise.all([
    db.from('player_bios').select('user_id, jersey_number, position, hero_photo_url, hidden_by_admin')
      .eq('organization_id', org.id).in('user_id', ids),
    db.from('notifications').select('user_id')
      .eq('organization_id', org.id).eq('type', 'card_nudge').in('user_id', ids)
      .filter('data->>league_id', 'eq', team.league_id ?? ''),
    db.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ])
  const bioBy = new Map((bios ?? []).map((b) => [b.user_id, b]))
  const nudged = new Set((earlier ?? []).map((n) => n.user_id))

  const targets = others.flatMap((m) => {
    const b = bioBy.get(m.user_id)
    if (b?.hidden_by_admin) return []
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
    const gaps = cardGaps({
      jerseyNumber: b?.jersey_number,
      position: b?.position ?? m.position,
      photoUrl: b?.hero_photo_url ?? (profile as { avatar_url?: string | null } | null)?.avatar_url,
    })
    return gaps.length > 0 ? [{ userId: m.user_id, gaps }] : []
  })
  const fresh = targets.filter((t) => !nudged.has(t.userId))
  if (fresh.length === 0) return { error: null, sent: 0, alreadyNudged: targets.length }

  const from = myProfile?.full_name?.split(' ')[0] || 'Your captain'
  const { error } = await createNotifications(fresh.map((t) => ({
    organization_id: org.id,
    user_id: t.userId,
    type: 'card_nudge',
    title: `🃏 ${from} wants your player card`,
    body: `Add ${describeGaps(t.gaps)} to finish the ${team.name} card binder.`,
    data: { href: '/profile#bio', link_label: 'Finish my card', league_id: team.league_id, team_id: team.id },
  })))
  if (error) return { error: "Couldn't send the nudges. Try again.", sent: 0, alreadyNudged: 0 }
  return { error: null, sent: fresh.length, alreadyNudged: targets.length - fresh.length }
}
