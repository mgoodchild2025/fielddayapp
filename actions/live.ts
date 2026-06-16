'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { requireOrgMember } from '@/lib/auth'
import { canAccess } from '@/lib/features'

export type LiveStream = {
  id: string
  platform: 'youtube' | 'instagram' | 'other'
  title: string | null
  url: string
  embed_url: string | null
  status: 'live' | 'ended'
  started_at: string
  league_id: string | null
  detected_via?: 'manual' | 'api'
}

/** Extract a YouTube video ID from watch/live/share/embed URLs. */
function youTubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([^?&#/]+)/,
    /youtube\.com\/watch\?.*v=([^&#]+)/,
    /youtube\.com\/live\/([^?&#/]+)/,
    /youtube\.com\/embed\/([^?&#/]+)/,
    /youtube\.com\/shorts\/([^?&#/]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}

/**
 * The live stream to show in a given context:
 *   - If leagueId is provided: that event's stream, else the org-wide stream.
 *   - If not: the org-wide stream only (league_id IS NULL).
 */
export async function getCurrentLiveStream(orgId: string, leagueId?: string | null): Promise<LiveStream | null> {
  const db = createServiceRoleClient()
  const cols = 'id, platform, title, url, embed_url, status, started_at, league_id'

  if (leagueId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: eventStream } = await (db as any)
      .from('live_streams').select(cols)
      .eq('organization_id', orgId).eq('league_id', leagueId).eq('status', 'live')
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
    if (eventStream) return eventStream as LiveStream
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgStream } = await (db as any)
    .from('live_streams').select(cols)
    .eq('organization_id', orgId).is('league_id', null).eq('status', 'live')
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  return (orgStream as LiveStream | null) ?? null
}

/** All currently-live streams for an org (admin management). */
export async function getActiveLiveStreams(orgId: string): Promise<LiveStream[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('live_streams')
    .select('id, platform, title, url, embed_url, status, started_at, league_id, detected_via')
    .eq('organization_id', orgId).eq('status', 'live')
    .order('started_at', { ascending: false })
  return (data ?? []) as LiveStream[]
}

const goLiveSchema = z.object({
  platform: z.enum(['youtube', 'instagram', 'other']),
  url: z.string().url('Enter a valid URL'),
  title: z.string().max(120).optional(),
  leagueId: z.string().uuid().optional().nullable(),
})

export async function goLive(input: z.infer<typeof goLiveSchema>): Promise<{ error: string | null }> {
  const parsed = goLiveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  if (!await canAccess(org.id, 'social_integration')) {
    return { error: 'Live streaming is available on the Pro plan and above.' }
  }

  const db = createServiceRoleClient()
  const leagueId = parsed.data.leagueId ?? null

  let embedUrl: string | null = null
  if (parsed.data.platform === 'youtube') {
    const vid = youTubeId(parsed.data.url)
    if (!vid) return { error: 'Could not read the YouTube video ID from that URL.' }
    // Use youtube.com/embed (not -nocookie); nocookie is occasionally stricter
    // with live content and can refuse to play where the standard embed works.
    embedUrl = `https://www.youtube.com/embed/${vid}?autoplay=1`
  }

  // Only replace a prior live stream with the SAME url (re-going-live with the
  // same link shouldn't create a duplicate). Different streams stay live
  // concurrently, so two games can each run their own stream and be assigned to
  // separate display screens.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('live_streams')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('organization_id', org.id).eq('status', 'live').eq('url', parsed.data.url)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('live_streams')
    .insert({
      organization_id: org.id,
      league_id: leagueId,
      platform: parsed.data.platform,
      title: parsed.data.title?.trim() || null,
      url: parsed.data.url,
      embed_url: embedUrl,
      status: 'live',
      detected_via: 'manual',
    })

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  revalidatePath('/admin/live')
  return { error: null }
}

/** End a specific live stream by id. */
export async function endLiveStream(id: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('live_streams')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', id).eq('organization_id', org.id).eq('status', 'live')

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  revalidatePath('/admin/live')
  return { error: null }
}
