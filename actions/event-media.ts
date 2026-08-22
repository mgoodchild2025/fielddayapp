'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { destroyAsset, archiveDownloadUrl } from '@/lib/cloudinary'
import { sendSms } from '@/lib/twilio'

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

  const { data } = await db
    .from('event_media').select(SELECT)
    .eq('league_id', leagueId).eq('status', 'approved')
    .order('created_at', { ascending: false })
  return mapRows(db, (data ?? []) as Row[])
}

/** All media for one event, any status (admin moderation queue). */
export async function getEventMediaForAdmin(leagueId: string): Promise<EventMediaItem[]> {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('event_media').select(SELECT)
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
  return mapRows(db, (data ?? []) as Row[])
}

/** Approved media across all of an org's events (org-wide /media page). */
export async function getOrgApprovedEventMedia(orgId: string, limit = 60): Promise<EventMediaItem[]> {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('event_media').select(SELECT)
    .eq('organization_id', orgId).eq('status', 'approved')
    .order('created_at', { ascending: false }).limit(limit)
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []
  const leagueIds = [...new Set(rows.map((r) => r.league_id))]

  const { data: leagues } = await db.from('leagues').select('id, name').in('id', leagueIds)
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


  const { data: league } = await db
    .from('leagues').select('id').eq('id', parsed.data.leagueId).eq('organization_id', org.id).maybeSingle()
  if (!league) return { error: 'Event not found.' }


  const { error } = await db.from('event_media').insert({
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

  // Alert admins that media is waiting (in-app + SMS). Fire-and-forget —
  // never block or fail the upload on notification delivery.
  notifyAdminsOfPendingMedia(db, { id: org.id, slug: org.slug }, parsed.data.leagueId, user.id).catch(() => {})

  revalidatePath(`/admin/events/${parsed.data.leagueId}/media`)
  return { error: null }
}

// ── Pending-media admin alerts ────────────────────────────────────────────────
// One alert per admin per event, gated by READ STATE: while an admin still has
// an unread "media pending" notification for this event, further uploads stay
// quiet (a 20-photo burst = one ping, one text). Once they open it — the bell
// link marks it read — the next upload alerts again. SMS goes only to admins
// with a phone number on their profile, and only when a fresh in-app
// notification was created, so texts can never outnumber bell items.

async function notifyAdminsOfPendingMedia(
  db: ReturnType<typeof createServiceRoleClient>,
  org: { id: string; slug: string },
  leagueId: string,
  uploaderUserId: string
): Promise<void> {
  const [{ data: admins }, { data: league }] = await Promise.all([
    db.from('org_members')
      .select('user_id')
      .eq('organization_id', org.id)
      .in('role', ['org_admin', 'league_admin'])
      .eq('status', 'active'),
    db.from('leagues').select('name').eq('id', leagueId).maybeSingle(),
  ])
  const adminIds = (admins ?? [])
    .map((a) => a.user_id as string)
    .filter((id) => id && id !== uploaderUserId) // don't alert the admin who uploaded
  if (adminIds.length === 0) return

  const leagueName = league?.name ?? 'your event'
  const path = `/admin/events/${leagueId}/media`
  const absoluteUrl = `https://${org.slug}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'}${path}`

  // Which admins still have an unread alert for this event? They stay quiet.
  const { data: unread } = await db
    .from('notifications')
    .select('user_id')
    .in('user_id', adminIds)
    .eq('organization_id', org.id)
    .eq('type', 'media_pending')
    .eq('data->>leagueId', leagueId)
    .or('read.is.null,read.eq.false')
  const quiet = new Set((unread ?? []).map((n) => n.user_id as string))
  const toAlert = adminIds.filter((id) => !quiet.has(id))
  if (toAlert.length === 0) return

  await db.from('notifications').insert(
    toAlert.map((userId) => ({
      organization_id: org.id,
      user_id: userId,
      type: 'media_pending',
      title: '📸 New media needs approval',
      body: `${leagueName}: photos or videos are waiting for review.`,
      data: { leagueId, href: path, link_label: 'Review media →' },
    }))
  )

  // SMS the same set — only those with a phone on file
  const { data: profiles } = await db
    .from('profiles')
    .select('id, phone')
    .in('id', toAlert)
    .not('phone', 'is', null)
  await Promise.all(
    (profiles ?? [])
      .filter((p) => p.phone)
      .map((p) =>
        sendSms(
          p.phone as string,
          `Fieldday: new photos/videos are waiting for approval in ${leagueName}. Review: ${absoluteUrl}`
        ).catch(() => ({ error: 'sms failed' }))
      )
  )
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

  const { data: row, error } = await db
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

  const { data: row } = await db
    .from('event_media').select('league_id, cloudinary_public_id, media_type')
    .eq('id', id).eq('organization_id', org.id).single()
  if (!row) return { error: 'Not found' }


  const { error } = await db.from('event_media').delete().eq('id', id).eq('organization_id', org.id)
  if (error) return { error: error.message }

  await destroyAsset(row.cloudinary_public_id, row.media_type === 'video' ? 'video' : 'image')

  revalidatePath(`/admin/events/${row.league_id}/media`)
  revalidatePath('/media')
  return { error: null }
}

// ── Export (data portability) ────────────────────────────────────────────────

export type MediaExport = {
  count: number
  manifestCsv: string
  imageZipUrl: string | null
  videoZipUrl: string | null
}

/**
 * Build an export of the org's event media: a CSV manifest (always complete)
 * plus Cloudinary ZIP archive links for images and videos. Org-admin only.
 */
export async function exportOrgEventMedia(): Promise<{ error: string | null; data: MediaExport | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', data: null }

  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members').select('role')
    .eq('organization_id', org.id).eq('user_id', user.id).single()
  if (member?.role !== 'org_admin') return { error: 'Only org admins can export media.', data: null }


  const { data: rows } = await db
    .from('event_media')
    .select('league_id, uploaded_by, cloudinary_url, cloudinary_public_id, media_type, caption, status, created_at')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  const media = (rows ?? []) as {
    league_id: string; uploaded_by: string | null; cloudinary_url: string
    cloudinary_public_id: string; media_type: 'image' | 'video'; caption: string | null
    status: string; created_at: string
  }[]

  if (media.length === 0) {
    return { error: null, data: { count: 0, manifestCsv: 'Event,Uploaded by,Type,Status,Caption,URL,Public ID,Uploaded at\n', imageZipUrl: null, videoZipUrl: null } }
  }

  // Resolve event + uploader names for the manifest.
  const leagueIds = [...new Set(media.map((m) => m.league_id))]
  const userIds = [...new Set(media.map((m) => m.uploaded_by).filter(Boolean) as string[])]

  const [{ data: leagues }, { data: profiles }] = await Promise.all([
    db.from('leagues').select('id, name').in('id', leagueIds),
    userIds.length > 0 ? db.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
  ])
  const leagueName = new Map<string, string>()
  for (const l of (leagues ?? []) as { id: string; name: string }[]) leagueName.set(l.id, l.name)
  const uploader = new Map<string, string>()
  for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) if (p.full_name) uploader.set(p.id, p.full_name)

  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
  const header = 'Event,Uploaded by,Type,Status,Caption,URL,Public ID,Uploaded at'
  const lines = media.map((m) => [
    esc(leagueName.get(m.league_id) ?? ''),
    esc(m.uploaded_by ? uploader.get(m.uploaded_by) ?? '' : ''),
    esc(m.media_type),
    esc(m.status),
    esc(m.caption ?? ''),
    esc(m.cloudinary_url),
    esc(m.cloudinary_public_id),
    esc(m.created_at),
  ].join(','))
  const manifestCsv = [header, ...lines].join('\n') + '\n'

  const imageIds = media.filter((m) => m.media_type !== 'video').map((m) => m.cloudinary_public_id)
  const videoIds = media.filter((m) => m.media_type === 'video').map((m) => m.cloudinary_public_id)

  return {
    error: null,
    data: {
      count: media.length,
      manifestCsv,
      imageZipUrl: archiveDownloadUrl(imageIds, 'image'),
      videoZipUrl: archiveDownloadUrl(videoIds, 'video'),
    },
  }
}
