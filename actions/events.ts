'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { getLimit, getActiveLeagueCount } from '@/lib/features'
import { isLeagueFrozen, invalidateBillingCache } from '@/lib/billing'
import { assertOrgAdmin, requireOrgMember } from '@/lib/auth'
import { convertToWebP } from '@/lib/image-utils'
import { optionalPhone } from '@/lib/validation'
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { purgeLeagueData } from '@/lib/purge-league'
import type { Database } from '@/types/database'

type LeagueStatus = Database['public']['Tables']['leagues']['Row']['status']

const createLeagueSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  event_type: z.enum(['league', 'tournament', 'pickup', 'drop_in']).default('league'),
  sport: z.string().default('beach_volleyball'),
  price_cents: z.coerce.number().min(0).default(0),
  payment_mode: z.enum(['per_player', 'per_team']).default('per_player'),
  payment_methods: z.array(z.enum(['card', 'etransfer', 'cash', 'cheque'])).optional(),
  payment_instructions: z.string().optional(),
  max_teams: z.coerce.number().optional(),
  max_participants: z.coerce.number().optional(),
  min_team_size: z.coerce.number().default(4),
  max_team_size: z.coerce.number().default(8),
  season_start_date: z.string().optional(),
  season_end_date: z.string().optional(),
  registration_opens_at: z.string().optional(),
  registration_closes_at: z.string().optional(),
  waiver_version_id: z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  age_group: z.string().optional(),
  venue_name: z.string().optional(),
  venue_address: z.string().optional(),
  venue_type: z.enum(['indoor', 'outdoor', 'both']).optional(),
  venue_surface: z.string().optional(),
  organizer_name: z.string().optional(),
  organizer_email: z.string().email().optional().or(z.literal('')),
  organizer_phone: optionalPhone,
  team_join_policy: z.enum(['open', 'captain_invite', 'admin_only']).default('open'),
  pickup_join_policy: z.enum(['public', 'link', 'private']).default('public'),
  registration_mode: z.enum(['session', 'season']).default('session'),
  drop_in_price_cents: z.coerce.number().min(0).optional(),
  schedule_visibility: z.enum(['public', 'participants']).default('public'),
  standings_visibility: z.enum(['public', 'participants']).default('public'),
  bracket_visibility: z.enum(['public', 'participants']).default('public'),
  documents_visibility: z.enum(['public', 'participants']).default('public'),
  days_of_week: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).optional().default([]),
  game_start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().or(z.literal('')),
  game_end_time:   z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().or(z.literal('')),
  skill_level: z.enum(['recreational', 'intermediate', 'competitive']).optional(),
  officiated: z.enum(['self_officiated', 'referee']).optional(),
  checkin_enabled: z.boolean().optional(),
  early_bird_price_cents: z.coerce.number().min(0).optional(),
  early_bird_deadline: z.string().optional(),
})

export async function createLeague(
  input: z.infer<typeof createLeagueSchema> & {
    rule_template_id?: string
    rules_content?: string
    format_content?: string
  }
) {
  const { rule_template_id, rules_content, format_content, ...rest } = input
  const parsed = createLeagueSchema.safeParse(rest)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { data: null, error: auth.error }

  const leagueCap = await getLimit(org.id, 'max_leagues')
  if (leagueCap !== null) {
    const count = await getActiveLeagueCount(org.id)
    if (count >= leagueCap) return { data: null, error: 'UPGRADE_REQUIRED' }
  }

  // Map event_type → league_type (legacy DB column)
  const leagueTypeMap: Record<string, string> = {
    league:     'team',
    tournament: 'tournament',
    pickup:     'individual',
    drop_in:    'dropin',
  }
  const league_type = leagueTypeMap[parsed.data.event_type] ?? 'team'

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('leagues')
    .insert({
      organization_id: org.id,
      league_type,
      ...parsed.data,
      payment_methods: parsed.data.payment_methods?.length ? parsed.data.payment_methods : null,
      payment_instructions: parsed.data.payment_instructions?.trim() || null,
      season_start_date: parsed.data.season_start_date || null,
      season_end_date: parsed.data.season_end_date || null,
      registration_opens_at: parsed.data.registration_opens_at || null,
      registration_closes_at: parsed.data.registration_closes_at || null,
      max_teams: parsed.data.max_teams ?? null,
      max_participants: parsed.data.max_participants ?? null,
      waiver_version_id: parsed.data.waiver_version_id ?? null,
      age_group: parsed.data.age_group || null,
      venue_name: parsed.data.venue_name || null,
      venue_address: parsed.data.venue_address || null,
      venue_type: parsed.data.venue_type ?? null,
      venue_surface: parsed.data.venue_surface || null,
      organizer_name: parsed.data.organizer_name || null,
      organizer_email: parsed.data.organizer_email || null,
      organizer_phone: parsed.data.organizer_phone || null,
      team_join_policy: parsed.data.team_join_policy,
      drop_in_price_cents: parsed.data.drop_in_price_cents ?? null,
      schedule_visibility: parsed.data.schedule_visibility,
      standings_visibility: parsed.data.standings_visibility,
      bracket_visibility: parsed.data.bracket_visibility,
      documents_visibility: parsed.data.documents_visibility,
      rule_template_id: rule_template_id || null,
      rules_content: rules_content || null,
      format_content: format_content || null,
      days_of_week: parsed.data.days_of_week?.length ? parsed.data.days_of_week : null,
      game_start_time: parsed.data.game_start_time || null,
      game_end_time:   parsed.data.game_end_time   || null,
      skill_level: parsed.data.skill_level ?? null,
      officiated: parsed.data.officiated ?? null,
      checkin_enabled: parsed.data.checkin_enabled ?? false,
      early_bird_price_cents: parsed.data.early_bird_price_cents ?? null,
      early_bird_deadline: parsed.data.early_bird_deadline || null,
      created_by: auth.userId,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  await recordAuditLog({
    orgId: org.id,
    actorUserId: auth.userId,
    actorLabel: auth.userId ? await getActorLabel(auth.userId) : null,
    action: AUDIT_ACTIONS.EVENT_CREATED,
    targetType: 'league',
    targetId: data.id,
    targetLabel: parsed.data.name,
    metadata: { event_type: parsed.data.event_type, price_cents: parsed.data.price_cents },
  })

  // Auto-add the creator as the first event organizer
  const { data: creatorProfile } = await db
    .from('profiles')
    .select('email')
    .eq('id', auth.userId!)
    .single()

  if (creatorProfile?.email) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('league_organizers').insert({
      organization_id: org.id,
      league_id: data.id,
      user_id: auth.userId,
      invited_email: creatorProfile.email,
      invited_by: auth.userId,
      status: 'active',
      expires_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    }).select('id').single()
  }

  revalidatePath('/admin/events')
  return { data, error: null }
}

export async function updateLeagueStatus(leagueId: string, status: LeagueStatus) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { data: null, error: auth.error }

  // Block activating a frozen league (over plan cap, grace expired)
  if (status === 'registration_open' || status === 'active') {
    const frozen = await isLeagueFrozen(leagueId, org.id)
    if (frozen) return { data: null, error: 'LEAGUE_FROZEN' }
  }

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prior } = await (db as any)
    .from('leagues').select('name, status').eq('id', leagueId).eq('organization_id', org.id).single()

  const { error } = await db
    .from('leagues')
    .update({ status })
    .eq('id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { data: null, error: error.message }

  await recordAuditLog({
    orgId: org.id,
    actorUserId: auth.userId,
    actorLabel: auth.userId ? await getActorLabel(auth.userId) : null,
    action: 'event.status_changed',
    targetType: 'league',
    targetId: leagueId,
    targetLabel: prior?.name ?? null,
    metadata: { from: prior?.status ?? null, to: status },
  })

  revalidatePath(`/admin/events/${leagueId}`)
  // Bust public caches so archive/restore reflects immediately on the
  // public homepage, events list, and event detail pages.
  revalidatePath('/', 'layout')
  // Archiving/completing a league may bring the org back within their plan limits
  invalidateBillingCache(org.id)
  return { data: null, error: null }
}

/** Fetch the acting admin's display label (name or email) for audit snapshots. */
async function getActorLabel(userId: string): Promise<string | null> {
  const db = createServiceRoleClient()
  const { data } = await db.from('profiles').select('full_name, email').eq('id', userId).single()
  return data?.full_name || data?.email || null
}

/**
 * Soft-delete an event — moves it to the Trash (recoverable). The event and all
 * its data are preserved; it's just flagged deleted and hidden from listings.
 * Permanent removal happens via purgeLeague (or the auto-purge cron after 30 days).
 */
export async function deleteLeague(leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org, ['org_admin'])
  if (auth.error) return { error: auth.error }
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('name').eq('id', leagueId).eq('organization_id', org.id).single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('leagues')
    .update({ deleted_at: new Date().toISOString(), deleted_by: auth.userId! })
    .eq('id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  await recordAuditLog({
    orgId: org.id,
    actorUserId: auth.userId!,
    actorLabel: await getActorLabel(auth.userId!),
    action: AUDIT_ACTIONS.EVENT_DELETED,
    targetType: 'league',
    targetId: leagueId,
    targetLabel: league?.name ?? null,
  })

  revalidatePath('/admin/events')
  revalidatePath('/', 'layout')
  return { error: null }
}

/** Restore a soft-deleted event from the Trash. */
export async function restoreLeague(leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org, ['org_admin'])
  if (auth.error) return { error: auth.error }
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('name').eq('id', leagueId).eq('organization_id', org.id).single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('leagues')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  await recordAuditLog({
    orgId: org.id,
    actorUserId: auth.userId!,
    actorLabel: await getActorLabel(auth.userId!),
    action: AUDIT_ACTIONS.EVENT_RESTORED,
    targetType: 'league',
    targetId: leagueId,
    targetLabel: league?.name ?? null,
  })

  revalidatePath('/admin/events')
  revalidatePath('/admin/events/trash')
  revalidatePath('/', 'layout')
  return { error: null }
}

/**
 * Permanently delete an event and all its data. Irreversible. Used by the
 * "Delete permanently" button in the Trash.
 */
export async function purgeLeague(leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org, ['org_admin'])
  if (auth.error) return { error: auth.error }

  const res = await purgeLeagueData(org.id, leagueId, auth.userId!, await getActorLabel(auth.userId!))
  if (res.error) return res

  revalidatePath('/admin/events')
  revalidatePath('/admin/events/trash')
  return { error: null }
}

export async function updateLeague(
  leagueId: string,
  updates: Partial<z.infer<typeof createLeagueSchema>> & {
    waiver_version_id?: string | null
    rule_template_id?: string | null
    rules_content?: string | null
    format_content?: string | null
    standings_pts_method?: string | null
    volleyball_standings_mode?: string | null
    // Nullable so clearing a date persists (undefined would be dropped by .update()).
    season_start_date?: string | null
    season_end_date?: string | null
    registration_opens_at?: string | null
    registration_closes_at?: string | null
  }
) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }

  // Normalize payment method config: empty array → null (= legacy fallback),
  // blank instructions → null.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = updates as any
  if (Array.isArray(u.payment_methods) && u.payment_methods.length === 0) u.payment_methods = null
  if (typeof u.payment_instructions === 'string') u.payment_instructions = u.payment_instructions.trim() || null

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('leagues')
    .update(updates)
    .eq('id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { data: null, error: error.message }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lg } = await (db as any)
    .from('leagues').select('name').eq('id', leagueId).eq('organization_id', org.id).single()
  await recordAuditLog({
    orgId: org.id,
    actorUserId: auth.userId,
    actorLabel: auth.userId ? await getActorLabel(auth.userId) : null,
    action: AUDIT_ACTIONS.EVENT_UPDATED,
    targetType: 'league',
    targetId: leagueId,
    targetLabel: lg?.name ?? null,
    metadata: { fields: Object.keys(updates) },
  })

  revalidatePath(`/admin/events/${leagueId}`)
  revalidatePath('/admin/calendar')
  return { data: null, error: null }
}

// ─── Event logo upload ────────────────────────────────────────────────────────

export async function uploadEventLogo(
  leagueId: string,
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }
  if (file.size > 5 * 1024 * 1024) return { url: null, error: 'File must be under 5 MB' }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type))
    return { url: null, error: 'JPEG, PNG, WebP, or SVG only' }

  const bytes = await file.arrayBuffer()
  // SVGs kept as-is (vector); raster images converted to WebP
  let converted: Awaited<ReturnType<typeof convertToWebP>> = null
  try {
    converted = await convertToWebP(bytes, file.type, { maxWidth: 800, maxHeight: 800 })
  } catch (err) {
    console.error('[uploadEventLogo] convertToWebP failed, falling back to original:', err)
  }
  const uploadBytes = converted?.buffer ?? Buffer.from(bytes)
  const uploadType = converted?.contentType ?? file.type
  const ext = converted ? 'webp' : (file.name.split('.').pop()?.toLowerCase() ?? 'png')
  const path = `${org.id}/${leagueId}/logo.${ext}`

  const db = createServiceRoleClient()

  // Delete existing files before uploading — extension may differ between uploads
  const { data: existing } = await db.storage.from('event-logos').list(`${org.id}/${leagueId}`)
  if (existing && existing.length > 0) {
    await db.storage.from('event-logos').remove(existing.map(f => `${org.id}/${leagueId}/${f.name}`))
  }

  const { error: upErr } = await db.storage
    .from('event-logos')
    .upload(path, uploadBytes, { contentType: uploadType, upsert: true })
  if (upErr) return { url: null, error: upErr.message }

  const { data: { publicUrl } } = db.storage.from('event-logos').getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('leagues').update({ logo_url: url }).eq('id', leagueId).eq('organization_id', org.id)

  revalidatePath(`/admin/events/${leagueId}`)
  revalidatePath('/', 'layout')
  return { url, error: null }
}

export async function removeEventLogo(
  leagueId: string,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  const { data: existing } = await db.storage.from('event-logos').list(`${org.id}/${leagueId}`)
  if (existing && existing.length > 0) {
    await db.storage.from('event-logos').remove(existing.map(f => `${org.id}/${leagueId}/${f.name}`))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('leagues').update({ logo_url: null }).eq('id', leagueId).eq('organization_id', org.id)

  revalidatePath(`/admin/events/${leagueId}`)
  revalidatePath('/', 'layout')
  return { error: null }
}

// ─── League PDF upload ────────────────────────────────────────────────────────

type LeagueDocType = 'rules' | 'format'

export async function uploadLeaguePdf(
  leagueId: string,
  docType: LeagueDocType,
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const file = formData.get('pdf') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }
  if (file.size > 10 * 1024 * 1024) return { url: null, error: 'File must be under 10 MB' }
  if (file.type !== 'application/pdf') return { url: null, error: 'PDF files only' }

  const db = createServiceRoleClient()
  const path = `${org.id}/leagues/${leagueId}/${docType}.pdf`

  const { error: upErr } = await db.storage
    .from('org-documents')
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (upErr) return { url: null, error: upErr.message }

  const { data: { publicUrl } } = db.storage.from('org-documents').getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`

  const col = docType === 'rules' ? 'rules_pdf_url' : 'format_pdf_url'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('leagues').update({ [col]: url }).eq('id', leagueId).eq('organization_id', org.id)

  revalidatePath(`/admin/events/${leagueId}`)
  return { url, error: null }
}

export async function removeLeaguePdf(
  leagueId: string,
  docType: LeagueDocType,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  const path = `${org.id}/leagues/${leagueId}/${docType}.pdf`
  await db.storage.from('org-documents').remove([path])

  const col = docType === 'rules' ? 'rules_pdf_url' : 'format_pdf_url'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('leagues').update({ [col]: null }).eq('id', leagueId).eq('organization_id', org.id)

  revalidatePath(`/admin/events/${leagueId}`)
  return { error: null }
}
