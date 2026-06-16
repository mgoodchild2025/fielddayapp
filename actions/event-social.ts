'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import {
  detectSocialPlatform, youTubeId, instagramShortcode, tiktokVideoIdFromUrl, fetchTikTokOEmbed,
  type SocialPlatform,
} from '@/lib/social-embed'

export type CuratedSocialPost = {
  id: string
  platform: SocialPlatform
  externalId: string
  mediaUrl: string
  embedUrl: string | null
  thumbnailUrl: string | null
  caption: string | null
}

async function requireSocialAdmin(orgId: string): Promise<string | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members').select('role')
    .eq('organization_id', orgId).eq('user_id', user.id).single()
  if (!member || !['org_admin', 'league_admin'].includes(member.role)) return null
  return user.id
}

/** Approved curated posts pinned to one event, newest first. */
export async function getCuratedSocialPosts(leagueId: string): Promise<CuratedSocialPost[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('social_media_items')
    .select('id, platform, external_id, media_url, embed_url, thumbnail_url, caption')
    .eq('league_id', leagueId).eq('source', 'curated').eq('approved', true).eq('hidden', false)
    .order('created_at', { ascending: false })
  return ((data ?? []) as {
    id: string; platform: SocialPlatform; external_id: string
    media_url: string; embed_url: string | null; thumbnail_url: string | null; caption: string | null
  }[]).map((r) => ({
    id: r.id, platform: r.platform, externalId: r.external_id,
    mediaUrl: r.media_url, embedUrl: r.embed_url, thumbnailUrl: r.thumbnail_url, caption: r.caption,
  }))
}

/** Admin pins an Instagram/TikTok/YouTube post to an event. */
export async function addCuratedSocialPost(leagueId: string, url: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const adminId = await requireSocialAdmin(org.id)
  if (!adminId) return { error: 'Unauthorized' }

  const clean = url.trim()
  const platform = detectSocialPlatform(clean)
  if (!platform) return { error: 'Use an Instagram, TikTok, or YouTube post link.' }

  // Verify league belongs to org.
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('id').eq('id', leagueId).eq('organization_id', org.id).maybeSingle()
  if (!league) return { error: 'Event not found.' }

  let externalId: string | null = null
  let mediaUrl = clean
  let embedUrl: string | null = null
  let thumbnailUrl: string | null = null
  let caption: string | null = null
  let type = 'video'

  if (platform === 'youtube') {
    externalId = youTubeId(clean)
    if (!externalId) return { error: 'Could not read the YouTube video id from that link.' }
    embedUrl = `https://www.youtube.com/embed/${externalId}`
    thumbnailUrl = `https://i.ytimg.com/vi/${externalId}/hqdefault.jpg`
    mediaUrl = `https://www.youtube.com/watch?v=${externalId}`
  } else if (platform === 'instagram') {
    externalId = instagramShortcode(clean)
    if (!externalId) return { error: 'Could not read the Instagram post id from that link.' }
    mediaUrl = `https://www.instagram.com/p/${externalId}/`
    type = 'image'
  } else {
    // tiktok — oEmbed resolves short links + gives a thumbnail
    const oembed = await fetchTikTokOEmbed(clean)
    externalId = oembed?.videoId ?? tiktokVideoIdFromUrl(clean)
    if (!externalId) return { error: 'Could not read the TikTok video id. Use the full video link.' }
    thumbnailUrl = oembed?.thumbnail ?? null
    caption = oembed?.title ?? null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('social_media_items').upsert({
    organization_id: org.id,
    league_id: leagueId,
    connection_id: null,
    platform,
    external_id: externalId,
    type,
    media_url: mediaUrl,
    embed_url: embedUrl,
    thumbnail_url: thumbnailUrl,
    caption,
    source: 'curated',
    approved: true,
    hidden: false,
    added_by: adminId,
  }, { onConflict: 'organization_id,platform,external_id' })
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/media`)
  return { error: null }
}

export async function removeCuratedSocialPost(id: string, leagueId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const adminId = await requireSocialAdmin(org.id)
  if (!adminId) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('social_media_items').delete()
    .eq('id', id).eq('organization_id', org.id).eq('source', 'curated')
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/media`)
  return { error: null }
}
