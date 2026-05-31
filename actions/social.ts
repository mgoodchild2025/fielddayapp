'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { requireOrgMember } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { resolveYouTubeChannel } from '@/lib/youtube'

export type SocialConnection = {
  id: string
  platform: string
  account_handle: string | null
  external_account_id: string
  sync_enabled: boolean
  live_sync_enabled: boolean
  last_synced_at: string | null
}

export type SyncedItem = {
  id: string
  platform: string
  type: string
  media_url: string
  thumbnail_url: string | null
  caption: string | null
  posted_at: string | null
  approved: boolean
  hidden: boolean
}

export async function getYouTubeConnection(orgId: string): Promise<SocialConnection | null> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('social_connections')
    .select('id, platform, account_handle, external_account_id, sync_enabled, live_sync_enabled, last_synced_at')
    .eq('organization_id', orgId)
    .eq('platform', 'youtube')
    .maybeSingle()
  return (data as SocialConnection | null) ?? null
}

/** Connect (or update) a YouTube channel for auto-sync. */
export async function connectYouTube(input: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  if (!await canAccess(org.id, 'social_integration')) {
    return { error: 'Social integration is available on the Pro plan and above.' }
  }

  const { channel, error } = await resolveYouTubeChannel(input)
  if (error || !channel) return { error: error ?? 'Could not resolve channel.' }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (db as any)
    .from('social_connections')
    .upsert(
      {
        organization_id: org.id,
        platform: 'youtube',
        external_account_id: channel.channelId,
        account_handle: channel.title,
        uploads_playlist_id: channel.uploadsPlaylistId,
        sync_enabled: true,
        live_sync_enabled: true,
      },
      { onConflict: 'organization_id,platform' }
    )
  if (upErr) return { error: upErr.message }

  revalidatePath('/admin/live')
  return { error: null }
}

export async function disconnectYouTube(): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('social_connections').delete().eq('organization_id', org.id).eq('platform', 'youtube')
  revalidatePath('/admin/live')
  return { error: null }
}

/** Admin: list synced items (the moderation queue) for an org. */
export async function listSyncedItems(orgId: string): Promise<SyncedItem[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('social_media_items')
    .select('id, platform, type, media_url, thumbnail_url, caption, posted_at, approved, hidden')
    .eq('organization_id', orgId)
    .order('posted_at', { ascending: false })
    .limit(60)
  return (data ?? []) as SyncedItem[]
}

/** Admin: approve / hide a synced item. */
export async function setItemApproval(itemId: string, approved: boolean): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('social_media_items')
    .update({ approved, hidden: !approved })
    .eq('id', itemId)
    .eq('organization_id', org.id)
  if (error) return { error: error.message }
  revalidatePath('/admin/live')
  revalidatePath('/gallery')
  return { error: null }
}

/** Public: approved videos for the gallery / display. */
export async function getApprovedVideos(orgId: string, limit = 12): Promise<SyncedItem[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('social_media_items')
    .select('id, platform, type, media_url, thumbnail_url, caption, posted_at, approved, hidden')
    .eq('organization_id', orgId)
    .eq('approved', true)
    .eq('hidden', false)
    .order('posted_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as SyncedItem[]
}
