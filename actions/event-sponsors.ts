'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { convertToWebP } from '@/lib/image-utils'

export type SponsorTier = 'gold' | 'silver' | 'bronze' | 'standard'

export interface ResolvedSponsor {
  id:            string   // event_sponsors.id, or `org-<org_sponsors.id>` for inherited org sponsors
  name:          string
  logo_url:      string | null
  website_url:   string | null
  tier:          SponsorTier
  display_order: number
}

const TIER_RANK: Record<string, number> = { gold: 0, silver: 1, bronze: 2, standard: 3 }

/**
 * Resolve the sponsors that should appear for an event: explicit event_sponsors
 * (links to org sponsors or event-only entries) plus — when show_org_sponsors is
 * on — every org sponsor not already linked. Sorted by display_order then tier.
 * No auth (used by public display + event page); pass the org id explicitly.
 */
export async function getEventSponsors(leagueId: string, orgId: string): Promise<ResolvedSponsor[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: league }, { data: links }, { data: orgSponsors }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('show_org_sponsors').eq('id', leagueId).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('event_sponsors')
      .select('id, sponsor_id, name, logo_url, website_url, tier, display_order, org:org_sponsors(name, logo_url, website_url, tier)')
      .eq('league_id', leagueId).eq('organization_id', orgId).order('display_order'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_sponsors')
      .select('id, name, logo_url, website_url, tier, display_order')
      .eq('organization_id', orgId).order('display_order'),
  ])

  const showOrg = league?.show_org_sponsors !== false
  const linkedIds = new Set<string>()
  const resolved: ResolvedSponsor[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (links ?? []) as any[]) {
    if (l.sponsor_id) {
      const o = Array.isArray(l.org) ? l.org[0] : l.org
      if (!o) continue
      linkedIds.add(l.sponsor_id)
      resolved.push({
        id: l.id, name: o.name,
        logo_url: o.logo_url ?? null, website_url: o.website_url ?? null,
        tier: (l.tier ?? o.tier ?? 'standard') as SponsorTier,
        display_order: l.display_order ?? 0,
      })
    } else {
      resolved.push({
        id: l.id, name: l.name ?? '',
        logo_url: l.logo_url ?? null, website_url: l.website_url ?? null,
        tier: (l.tier ?? 'standard') as SponsorTier,
        display_order: l.display_order ?? 0,
      })
    }
  }

  if (showOrg) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (orgSponsors ?? []) as any[]) {
      if (linkedIds.has(s.id)) continue
      resolved.push({
        id: `org-${s.id}`, name: s.name,
        logo_url: s.logo_url ?? null, website_url: s.website_url ?? null,
        tier: (s.tier ?? 'standard') as SponsorTier,
        display_order: 1000 + (s.display_order ?? 0), // inherited org sponsors after explicit event ones
      })
    }
  }

  resolved.sort((a, b) => (a.display_order - b.display_order) || (TIER_RANK[a.tier] - TIER_RANK[b.tier]))
  return resolved
}

// ── Admin: page data ──────────────────────────────────────────────────────────

export interface EventSponsorRow {
  id: string; sponsor_id: string | null; name: string; logo_url: string | null
  website_url: string | null; tier: SponsorTier; display_order: number
}
export interface OrgSponsorOption { id: string; name: string; logo_url: string | null; tier: SponsorTier }

export async function getEventSponsorPageData(leagueId: string): Promise<{
  showOrgSponsors: boolean
  links: EventSponsorRow[]          // explicit event_sponsors rows (resolved display name for links)
  orgSponsors: OrgSponsorOption[]   // full org directory (for the "link existing" picker)
  linkedSponsorIds: string[]        // org sponsor ids already linked to this event
}> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: league }, { data: rows }, { data: orgSponsors }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('show_org_sponsors').eq('id', leagueId).eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('event_sponsors')
      .select('id, sponsor_id, name, logo_url, website_url, tier, display_order, org:org_sponsors(name, logo_url, website_url)')
      .eq('league_id', leagueId).eq('organization_id', org.id).order('display_order'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_sponsors').select('id, name, logo_url, tier').eq('organization_id', org.id).order('display_order'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const links: EventSponsorRow[] = ((rows ?? []) as any[]).map((r) => {
    const o = Array.isArray(r.org) ? r.org[0] : r.org
    return {
      id: r.id, sponsor_id: r.sponsor_id ?? null,
      name: r.sponsor_id ? (o?.name ?? '') : (r.name ?? ''),
      logo_url: r.sponsor_id ? (o?.logo_url ?? null) : (r.logo_url ?? null),
      website_url: r.sponsor_id ? (o?.website_url ?? null) : (r.website_url ?? null),
      tier: (r.tier ?? 'standard') as SponsorTier,
      display_order: r.display_order ?? 0,
    }
  })

  return {
    showOrgSponsors: league?.show_org_sponsors !== false,
    links,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orgSponsors: ((orgSponsors ?? []) as any[]).map((s) => ({ id: s.id, name: s.name, logo_url: s.logo_url ?? null, tier: (s.tier ?? 'standard') as SponsorTier })),
    linkedSponsorIds: links.filter((l) => l.sponsor_id).map((l) => l.sponsor_id as string),
  }
}

// ── Admin: mutations ────────────────────────────────────────────────────────

async function nextOrder(db: ReturnType<typeof createServiceRoleClient>, leagueId: string, orgId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).from('event_sponsors')
    .select('display_order').eq('league_id', leagueId).eq('organization_id', orgId)
    .order('display_order', { ascending: false }).limit(1).maybeSingle()
  return ((data as { display_order: number } | null)?.display_order ?? -1) + 1
}

export async function setShowOrgSponsors(leagueId: string, value: boolean): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('leagues').update({ show_org_sponsors: value }).eq('id', leagueId).eq('organization_id', org.id)
  if (error) return { error: error.message }
  revalidatePath(`/admin/events/${leagueId}/sponsors`)
  return { error: null }
}

export async function linkOrgSponsor(leagueId: string, sponsorId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const db = createServiceRoleClient()
  const display_order = await nextOrder(db, leagueId, org.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('event_sponsors')
    .insert({ organization_id: org.id, league_id: leagueId, sponsor_id: sponsorId, display_order })
  if (error) return { error: error.message }
  revalidatePath(`/admin/events/${leagueId}/sponsors`)
  return { error: null }
}

const eventOnlySchema = z.object({
  leagueId: z.string().uuid(),
  name: z.string().min(1).max(100),
  website_url: z.string().url().optional().or(z.literal('')),
  tier: z.enum(['gold', 'silver', 'bronze', 'standard']).default('standard'),
})

export async function addEventOnlySponsor(formData: FormData): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const parsed = eventOnlySchema.safeParse({
    leagueId: formData.get('leagueId'),
    name: formData.get('name'),
    website_url: formData.get('website_url') ?? '',
    tier: formData.get('tier') ?? 'standard',
  })
  if (!parsed.success) return { error: 'Invalid input' }
  const db = createServiceRoleClient()

  // Insert the row first to get an id for the logo path
  const display_order = await nextOrder(db, parsed.data.leagueId, org.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (db as any).from('event_sponsors')
    .insert({
      organization_id: org.id, league_id: parsed.data.leagueId,
      name: parsed.data.name, website_url: parsed.data.website_url || null,
      tier: parsed.data.tier, display_order,
    })
    .select('id').single()
  if (error || !inserted) return { error: error?.message ?? 'Failed to add sponsor' }
  const id = (inserted as { id: string }).id

  // Optional logo
  const file = formData.get('logo') as File | null
  if (file && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) return { error: 'Logo must be under 2 MB' }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type))
      return { error: 'Logo must be JPEG, PNG, WebP, or SVG' }
    const bytes = await file.arrayBuffer()
    const converted = await convertToWebP(bytes, file.type, { maxWidth: 800, maxHeight: 400 })
    const uploadBytes = converted?.buffer ?? Buffer.from(bytes)
    const uploadType = converted?.contentType ?? file.type
    const ext = converted ? 'webp' : (file.name.split('.').pop() ?? 'png')
    const path = `${org.id}/event-sponsors/${id}.${ext}`
    const { error: upErr } = await db.storage.from('org-branding').upload(path, uploadBytes, { contentType: uploadType, upsert: true })
    if (!upErr) {
      const { data: { publicUrl } } = db.storage.from('org-branding').getPublicUrl(path)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('event_sponsors').update({ logo_url: `${publicUrl}?t=${Date.now()}` }).eq('id', id)
    }
  }

  revalidatePath(`/admin/events/${parsed.data.leagueId}/sponsors`)
  return { error: null }
}

export async function removeEventSponsor(id: string, leagueId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('event_sponsors').delete().eq('id', id).eq('organization_id', org.id)
  if (error) return { error: error.message }
  revalidatePath(`/admin/events/${leagueId}/sponsors`)
  return { error: null }
}
