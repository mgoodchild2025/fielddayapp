'use server'

import { createServiceRoleClient } from '@/lib/supabase/service'
import { createServerClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

// ── Constants ─────────────────────────────────────────────────────────────────

/** The three document slugs that form the mandatory tenant consent bundle. */
export const TENANT_CONSENT_SLUGS = ['terms', 'tenant-privacy', 'dpa'] as const
export type TenantConsentSlug = (typeof TENANT_CONSENT_SLUGS)[number]

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TenantAcceptance {
  id: string
  organization_id: string
  accepted_by_user_id: string
  document_slug: string
  document_version: string
  document_version_id: string | null
  acceptance_type: 'onboarding' | 'reacceptance' | 'manual'
  accepted_at: string
  ip_address: string | null
  user_agent: string | null
  notes: string | null
  // joined
  document_title?: string
  accepted_by_name?: string | null
  accepted_by_email?: string | null
}

export interface ConsentDoc {
  slug: string
  title: string
  version: string
  effectiveDate: string | null
  versionId: string | null
  url: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requirePlatformAdmin(): Promise<string> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (db as any)
    .from('profiles').select('platform_role').eq('id', user.id).single()

  if (profile?.platform_role !== 'platform_admin') throw new Error('Platform admin required')
  return user.id
}

/** Fetch the three published tenant consent documents. Returns null if any is missing. */
export async function getTenantConsentDocs(): Promise<ConsentDoc[] | null> {
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: docs } = await (db as any)
    .from('legal_documents')
    .select('slug, title, version, effective_date, published_content, is_published')
    .in('slug', TENANT_CONSENT_SLUGS)

  if (!docs) return null

  const results: ConsentDoc[] = []
  for (const slug of TENANT_CONSENT_SLUGS) {
    const d = (docs as Array<{ slug: string; title: string; version: string | null; effective_date: string | null; is_published: boolean }>)
      .find((doc) => doc.slug === slug)
    if (!d || !d.is_published || !d.version) return null  // any missing = block onboarding

    // Get the version row id for this version
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: versionRow } = await (db as any)
      .from('legal_document_versions')
      .select('id')
      .eq('version', d.version)
      .order('published_at', { ascending: false })
      .limit(1)
      .single()

    results.push({
      slug: d.slug,
      title: d.title,
      version: d.version,
      effectiveDate: d.effective_date,
      versionId: versionRow?.id ?? null,
      url: `/legal/${d.slug}`,
    })
  }

  return results
}

/** Write one acceptance row per document in a single batch insert. Service role only. */
export async function writeAcceptanceRows({
  organizationId,
  userId,
  docs,
  acceptanceType,
  ipAddress,
  userAgent,
}: {
  organizationId: string
  userId: string
  docs: ConsentDoc[]
  acceptanceType: 'onboarding' | 'reacceptance' | 'manual'
  ipAddress: string | null
  userAgent: string | null
}): Promise<{ error: string | null }> {
  const db = createServiceRoleClient()

  const rows = docs.map((doc) => ({
    organization_id: organizationId,
    accepted_by_user_id: userId,
    document_slug: doc.slug,
    document_version: doc.version,
    document_version_id: doc.versionId,
    acceptance_type: acceptanceType,
    accepted_at: new Date().toISOString(),
    ip_address: ipAddress,
    user_agent: userAgent,
    notes: null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('tenant_acceptances').insert(rows)
  return { error: error?.message ?? null }
}

// ── Check for pending reacceptance ────────────────────────────────────────────

export interface PendingReacceptanceDoc {
  slug: string
  title: string
  version: string
  effectiveDate: string | null
  versionId: string | null
  reconsentSummary: string | null
  url: string
}

/**
 * Returns the docs that require reacceptance for this org.
 * A doc requires reacceptance when the latest published version that has
 * requires_reconsent=true is newer than the org's last acceptance for that slug.
 */
export async function getPendingReacceptance(orgId: string): Promise<PendingReacceptanceDoc[]> {
  const db = createServiceRoleClient()
  const pending: PendingReacceptanceDoc[] = []

  for (const slug of TENANT_CONSENT_SLUGS) {
    // Get latest published version that requires_reconsent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: latestRequired } = await (db as any)
      .from('legal_document_versions')
      .select(`
        id, version, effective_date, published_at, requires_reconsent, reconsent_summary,
        document:legal_documents!legal_document_versions_document_id_fkey(slug, title)
      `)
      .eq('requires_reconsent', true)
      .order('published_at', { ascending: false })
      .limit(50)  // get enough to filter by slug

    const forSlug = (latestRequired ?? []).find(
      (v: { document: { slug: string } | null }) => v.document?.slug === slug
    )
    if (!forSlug) continue  // no reconsent-requiring version for this doc

    // Get the org's most recent acceptance for this slug
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lastAcceptance } = await (db as any)
      .from('tenant_acceptances')
      .select('accepted_at')
      .eq('organization_id', orgId)
      .eq('document_slug', slug)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .single()

    const acceptedAt = lastAcceptance?.accepted_at ? new Date(lastAcceptance.accepted_at) : null
    const requiredSince = new Date(forSlug.published_at)

    if (!acceptedAt || acceptedAt < requiredSince) {
      pending.push({
        slug,
        title: forSlug.document?.title ?? slug,
        version: forSlug.version,
        effectiveDate: forSlug.effective_date ?? null,
        versionId: forSlug.id,
        reconsentSummary: forSlug.reconsent_summary ?? null,
        url: `/legal/${slug}`,
      })
    }
  }

  return pending
}

// ── Tenant-facing: read own acceptances ───────────────────────────────────────

export async function getOrgAcceptances(orgId: string): Promise<TenantAcceptance[]> {
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('tenant_acceptances')
    .select(`
      *,
      accepted_by:profiles!tenant_acceptances_accepted_by_user_id_fkey(full_name, email)
    `)
    .eq('organization_id', orgId)
    .order('accepted_at', { ascending: false })

  return ((data ?? []) as Array<TenantAcceptance & { accepted_by?: { full_name: string | null; email: string | null } | null }>)
    .map((r) => ({
      ...r,
      accepted_by_name: r.accepted_by?.full_name ?? null,
      accepted_by_email: r.accepted_by?.email ?? null,
    }))
}

// ── Platform admin: read all acceptances ─────────────────────────────────────

export async function getOrgAcceptancesAdmin(orgId: string): Promise<TenantAcceptance[]> {
  await requirePlatformAdmin()
  return getOrgAcceptances(orgId)
}

export async function searchAcceptances({
  userEmail,
  documentSlug,
  fromDate,
  toDate,
}: {
  userEmail?: string
  documentSlug?: string
  fromDate?: string
  toDate?: string
}): Promise<TenantAcceptance[]> {
  await requirePlatformAdmin()
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db as any)
    .from('tenant_acceptances')
    .select(`
      *,
      org:organizations!tenant_acceptances_organization_id_fkey(name, slug),
      accepted_by:profiles!tenant_acceptances_accepted_by_user_id_fkey(full_name, email)
    `)
    .order('accepted_at', { ascending: false })
    .limit(200)

  if (documentSlug) q = q.eq('document_slug', documentSlug)
  if (fromDate) q = q.gte('accepted_at', fromDate)
  if (toDate) q = q.lte('accepted_at', toDate + 'T23:59:59Z')

  const { data } = await q

  let results = (data ?? []) as Array<TenantAcceptance & {
    org?: { name: string; slug: string } | null
    accepted_by?: { full_name: string | null; email: string | null } | null
  }>

  // Filter by email client-side (can't join-filter easily)
  if (userEmail) {
    const lower = userEmail.toLowerCase()
    results = results.filter((r) => r.accepted_by?.email?.toLowerCase().includes(lower))
  }

  return results.map((r) => ({
    ...r,
    accepted_by_name: r.accepted_by?.full_name ?? null,
    accepted_by_email: r.accepted_by?.email ?? null,
  }))
}

// ── Platform admin: record manual acceptance ──────────────────────────────────

export async function recordManualAcceptance(input: {
  organizationId: string
  acceptedByUserId: string
  documentSlug: string
  documentVersion: string
  documentVersionId: string | null
  acceptedAt: string
  notes: string
}): Promise<{ error: string | null }> {
  try {
    await requirePlatformAdmin()
    const db = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from('tenant_acceptances').insert({
      organization_id: input.organizationId,
      accepted_by_user_id: input.acceptedByUserId,
      document_slug: input.documentSlug,
      document_version: input.documentVersion,
      document_version_id: input.documentVersionId,
      acceptance_type: 'manual',
      accepted_at: input.acceptedAt,
      notes: input.notes,
    })

    return { error: error?.message ?? null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Server action: reaccept ────────────────────────────────────────────────────

export async function submitReacceptance(
  orgId: string,
  accepted: boolean,
): Promise<{ error: string | null }> {
  if (!accepted) return { error: 'You must accept the agreements to continue' }

  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (db as any)
      .from('org_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!member || member.role !== 'org_admin') {
      return { error: 'Only organization admins can accept agreements' }
    }

    const pending = await getPendingReacceptance(orgId)
    if (pending.length === 0) return { error: null }  // nothing to do

    const headersList = await headers()
    const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const userAgent = headersList.get('user-agent') ?? null

    const consentDocs: ConsentDoc[] = pending.map((d) => ({
      slug: d.slug,
      title: d.title,
      version: d.version,
      effectiveDate: d.effectiveDate,
      versionId: d.versionId,
      url: d.url,
    }))

    return writeAcceptanceRows({
      organizationId: orgId,
      userId: user.id,
      docs: consentDocs,
      acceptanceType: 'reacceptance',
      ipAddress,
      userAgent,
    })
  } catch (e) {
    return { error: (e as Error).message }
  }
}
