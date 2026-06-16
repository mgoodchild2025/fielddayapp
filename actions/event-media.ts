'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { destroyAsset } from '@/lib/cloudinary'

// ── Types ────────────────────────────────────────────────────────────────────

export type EventMediaItem = {
  id: string
  source: 'upload'            // 'social' added in phase 2
  mediaType: 'image' | 'video'
  url: string
  thumbnailUrl: string | null
  caption: string | null
  uploaderName: string | null
  leagueId: string
  leagueName?: string | null
  status: 'pending' | 'approved' | 'hidden'
  createdAt: string
}

type Row = {
  id: string; league_id: string; uploaded_by: string | null
  cloudinary_url: string; thumbnail_url: string | null
  media_type: 'image' | 'video'; caption: string | null
  status: 'pending' | 'approved' | 'hidden'; created_at: string
}

async function mapRows(db: ReturnType<typeof createServiceRoleClient>, rows: Row[], leagueNames?: Map<string, string>): Promise<EventMediaItem[]> {
  const uploaderIds = [...new Set(rows.map((r) => r.uploaded_by).filter(Boolean) as string[])]
  const names = new Map<string, string>()
  if (uploaderIds.length > 0) {
    const { data: profiles } = await db.from('profiles').select('id, full_name').in('id', uploaderIds)
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name) names.set(p.id, p.full_name)
    }
  }
  return rows.map((r) => ({
    id: r.id,
    source: 'upload' as const,
    mediaType: r.media_type,
    url: r.cloudinary_url,
    thumbnailUrl: r.thumbnail_url,
    caption: r.caption,
    uploaderName: r.uploaded_by ? names.get(r.uploaded_by) ?? null : null,
    leagueId: r.league_id,
    leagueName: leagueNames?.get(r.league_id) ?? null,
    status: r.status,
    createdAt: r.created_at,
  }))
}

// ── Read ─────────────────────────────────────────────────────────────────────

const SELECT = 'id, league_id, uploaded_by, cloudinary_url, thumbnail_url, media_type, caption, status, created_at'

/** Approved media for one event (public gallery). */
export async function getApprovedEventMedia(leagueId: string): Promise<EventMediaItem[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('event_media').select(SELECT)
    .eq('league_id', leagueId).eq('status', 'approved')
    .order('created_at', { ascending: false })
  return mapRows(db, (data ?? []) as Row[])
}

/** All media for one event, any status (admin moderation queue). */
export async function getEventMediaForAdmin(leagueId: string): Promise<EventMediaItem[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('event_media').select(SELECT)
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
  return mapRows(db, (data ?? []) as Row[])
}

/** Approved media across all of an org's events (org-wide /media page). */
export async function getOrgApprovedEventMedia(orgId: string, limit = 60): Promise<EventMediaItem[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('event_media').select(SELECT)
    .eq('organization_id', orgId).eq('status', 'approved')
    .order('created_at', { ascending: false }).limit(limit)
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []
  const leagueIds = [...new Set(rows.map((r) => r.league_id))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leagues } = await (db as any).from('leagues').select('id, name').in('id', leagueIds)
  const leagueNames = new Map<string, string>()
  for (const l of (leagues ?? []) as { id: string; name: string }[]) leagueNames.set(l.id, l.name)
  return mapRows(db, rows, leagueNames)
}

// ── Write ────────────────────────────────────────────────────────────────────

const recordSchema = z.object({
  leagueId: z.string().uuid(),
  publicId: z.string().min(1),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional().nullable(),
  mediaType: z.enum(['image', 'video']),
  caption: z.string().max(500).optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationSeconds: z.number().optional(),
})

/** Record a completed Cloudinary upload. Any logged-in org member may upload;
 *  the item starts 'pending' until an admin approves it. */
export async function recordEventMediaUpload(input: z.infer<typeof recordSchema>): Promise<{ error: string | null }> {
  const parsed = recordSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid upload data.' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in to upload.' }

  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members').select('user_id')
    .eq('organization_id', org.id).eq('user_id', user.id).maybeSingle()
  if (!member) return { error: 'Not a member of this organization.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('id').eq('id', parsed.data.leagueId).eq('organization_id', org.id).maybeSingle()
  if (!league) return { error: 'Event not found.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('event_media').insert({
    organization_id: org.id,
    league_id: parsed.data.leagueId,
    uploaded_by: user.id,
    cloudinary_public_id: parsed.data.publicId,
    cloudinary_url: parsed.data.url,
    thumbnail_url: parsed.data.thumbnailUrl ?? null,
    media_type: parsed.data.mediaType,
    caption: parsed.data.caption?.trim() || null,
    width: parsed.data.width ?? null,
    height: parsed.data.height ?? null,
    duration_seconds: parsed.data.durationSeconds ?? null,
    status: 'pending',
  })
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${parsed.data.leagueId}/media`)
  return { error: null }
}

async function requireMediaAdmin(orgId: string) {
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

export async function moderateEventMedia(id: string, action: 'approve' | 'hide'): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const adminId = await requireMediaAdmin(org.id)
  if (!adminId) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  const fields = action === 'approve'
    ? { status: 'approved', approved_by: adminId, approved_at: new Date().toISOString() }
    : { status: 'hidden' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (db as any)
    .from('event_media').update(fields)
    .eq('id', id).eq('organization_id', org.id).select('league_id').single()
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${row?.league_id}/media`)
  revalidatePath('/media')
  return { error: null }
}

export async function deleteEventMedia(id: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const adminId = await requireMediaAdmin(org.id)
  if (!adminId) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (db as any)
    .from('event_media').select('league_id, cloudinary_public_id, media_type')
    .eq('id', id).eq('organization_id', org.id).single()
  if (!row) return { error: 'Not found' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('event_media').delete().eq('id', id).eq('organization_id', org.id)
  if (error) return { error: error.message }

  await destroyAsset(row.cloudinary_public_id, row.media_type === 'video' ? 'video' : 'image')

  revalidatePath(`/admin/events/${row.league_id}/media`)
  revalidatePath('/media')
  return { error: null }
}
