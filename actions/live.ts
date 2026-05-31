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

/** Public read — the current live stream for an org (or null). */
export async function getCurrentLiveStream(orgId: string): Promise<LiveStream | null> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('live_streams')
    .select('id, platform, title, url, embed_url, status, started_at')
    .eq('organization_id', orgId)
    .eq('status', 'live')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as LiveStream | null) ?? null
}

const goLiveSchema = z.object({
  platform: z.enum(['youtube', 'instagram', 'other']),
  url: z.string().url('Enter a valid URL'),
  title: z.string().max(120).optional(),
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

  // Derive an embeddable URL for YouTube; Instagram Live can't be iframe-embedded
  let embedUrl: string | null = null
  if (parsed.data.platform === 'youtube') {
    const vid = youTubeId(parsed.data.url)
    if (!vid) return { error: 'Could not read the YouTube video ID from that URL.' }
    embedUrl = `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1`
  }

  // End any existing live stream first (one live stream at a time)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('live_streams')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('organization_id', org.id)
    .eq('status', 'live')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('live_streams')
    .insert({
      organization_id: org.id,
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

export async function endLive(): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('live_streams')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('organization_id', org.id)
    .eq('status', 'live')

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  revalidatePath('/admin/live')
  return { error: null }
}
