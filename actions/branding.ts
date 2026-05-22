'use server'

import { promises as dnsPromises } from 'dns'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { convertToWebP } from '@/lib/image-utils'
import { addRailwayCustomDomain, removeRailwayCustomDomain, getRailwayDomainStatus, isRailwayConfigured, type RailwayDnsRecord } from '@/lib/railway'

/**
 * Independent server-side DNS check for a CNAME record.
 * Overrides Railway's slow/lagging PENDING status to VALID when the
 * record actually resolves to the expected target.
 */
async function verifyCnameRecords(records: RailwayDnsRecord[]): Promise<RailwayDnsRecord[]> {
  const normalize = (v: string) => v.replace(/\.$/, '').toLowerCase()

  return Promise.all(records.map(async (record) => {
    // Only re-check CNAME records that Railway hasn't confirmed yet
    if (record.recordType !== 'CNAME' || record.status === 'VALID') return record
    try {
      const resolved = await dnsPromises.resolveCname(record.hostlabel)
      const expected = normalize(record.requiredValue)
      if (resolved.some(v => normalize(v) === expected)) {
        return { ...record, status: 'VALID' as const }
      }
    } catch {
      // DNS lookup failed (NXDOMAIN, timeout, etc.) — keep Railway's status
    }
    return record
  }))
}

const brandingSchema = z.object({
  orgId: z.string().uuid(),
  primary_color: z.string(),
  secondary_color: z.string(),
  bg_color: z.string(),
  text_color: z.string(),
  heading_font: z.string(),
  body_font: z.string(),
  tagline: z.string().optional(),
  contact_email: z.string().optional(),
  custom_domain: z.string().optional(),
  social_instagram: z.string().optional(),
  social_facebook: z.string().optional(),
  social_x: z.string().optional(),
  social_tiktok: z.string().optional(),
  social_youtube: z.string().optional(),
  timezone: z.string().optional(),
})

export async function updateBranding(input: z.infer<typeof brandingSchema>) {
  const parsed = brandingSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const { orgId, ...brandingData } = parsed.data

  // Verify the caller is an admin of this org
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const service = createServiceRoleClient()

  const { data: member } = await service
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { data: null, error: 'Unauthorized' }
  }

  // ── Custom domain: sync with Railway ──────────────────────────────────────
  // Read the current branding row so we know what domain (if any) is already registered.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (service as any)
    .from('org_branding')
    .select('custom_domain, railway_domain_id')
    .eq('organization_id', orgId)
    .maybeSingle() as { data: { custom_domain: string | null; railway_domain_id: string | null } | null }

  const newDomain  = brandingData.custom_domain?.trim() || null
  const oldDomain  = existing?.custom_domain ?? null
  const railwayId  = existing?.railway_domain_id ?? null
  const domainChanged = newDomain !== oldDomain
  // Also re-register if the domain is already saved but was never successfully
  // registered with Railway (e.g. saved before the integration was set up)
  const needsRailwayRegistration = domainChanged || (!!newDomain && !railwayId)

  let newRailwayId: string | null = railwayId
  let dnsRecords: RailwayDnsRecord[] = []
  let domainError: string | null = null

  if (needsRailwayRegistration && isRailwayConfigured()) {
    // Remove the old domain from Railway if one was registered
    if (oldDomain && railwayId) {
      await removeRailwayCustomDomain(railwayId)
      newRailwayId = null
    }

    // Register the new domain with Railway (provisions TLS cert automatically)
    if (newDomain) {
      const result = await addRailwayCustomDomain(newDomain)
      if (result) {
        newRailwayId = result.id
        dnsRecords = result.dnsRecords
      } else {
        // Railway registration failed — save the domain anyway but surface a warning
        domainError = 'Domain saved, but could not register it with Railway automatically. ' +
          'Please add it manually in the Railway dashboard to enable SSL.'
      }
    }
  }

  // ── Save branding (without railway_domain_id — separate step below) ─────────
  const { error } = await service
    .from('org_branding')
    .upsert({
      organization_id: orgId,
      ...brandingData,
      tagline: brandingData.tagline || null,
      contact_email: brandingData.contact_email || null,
      custom_domain: newDomain,
      social_instagram: brandingData.social_instagram || null,
      social_facebook: brandingData.social_facebook || null,
      social_x: brandingData.social_x || null,
      social_tiktok: brandingData.social_tiktok || null,
      social_youtube: brandingData.social_youtube || null,
      timezone: brandingData.timezone || 'America/Toronto',
    }, { onConflict: 'organization_id' })

  if (error) return { data: null, error: error.message }

  // ── Persist Railway domain ID + DNS records (separate, non-blocking) ───────
  // Done separately so that missing columns (migrations not yet applied) never
  // prevent the branding fields above from saving.
  if (needsRailwayRegistration && newRailwayId !== railwayId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any)
      .from('org_branding')
      .update({
        railway_domain_id:  newRailwayId,
        railway_cname_host:  dnsRecords.find((r) => r.recordType === 'CNAME')?.hostlabel  ?? null,
        railway_cname_value: dnsRecords.find((r) => r.recordType === 'CNAME')?.requiredValue ?? null,
        railway_txt_host:    dnsRecords.find((r) => r.recordType === 'TXT')?.hostlabel    ?? null,
        railway_txt_value:   dnsRecords.find((r) => r.recordType === 'TXT')?.requiredValue ?? null,
      })
      .eq('organization_id', orgId)
  }

  revalidatePath('/admin/settings/branding')
  revalidatePath('/', 'layout')

  // Return domain warning as a non-fatal advisory (settings were saved)
  return { data: null, error: null, domainWarning: domainError, dnsRecords }
}

/**
 * Re-query Railway for the latest DNS record statuses for the org's custom domain.
 * Called by the "Check DNS" button in the branding form.
 */
export async function refreshDnsStatus(orgId: string): Promise<{ records: RailwayDnsRecord[] | null; error: string | null }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { records: null, error: 'Not authenticated' }

  const service = createServiceRoleClient()

  const { data: member } = await service
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { records: null, error: 'Unauthorized' }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: branding } = await (service as any)
    .from('org_branding')
    .select('custom_domain, railway_domain_id')
    .eq('organization_id', orgId)
    .maybeSingle() as { data: { custom_domain: string | null; railway_domain_id: string | null } | null }

  let railwayDomainId = branding?.railway_domain_id ?? null

  // If we don't have a Railway domain ID yet but we have a saved custom domain,
  // try to register it now (Railway will recover an existing registration if the
  // domain was previously added manually or before ID-tracking was in place).
  if (!railwayDomainId && branding?.custom_domain) {
    if (!isRailwayConfigured()) {
      return { records: null, error: 'Railway API is not configured. Add RAILWAY_API_TOKEN to your environment.' }
    }
    const result = await addRailwayCustomDomain(branding.custom_domain)
    if (!result) {
      return { records: null, error: 'Could not register domain with Railway. Check RAILWAY_API_TOKEN and Railway dashboard.' }
    }
    railwayDomainId = result.id
    // Persist the recovered ID and DNS records for future calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any)
      .from('org_branding')
      .update({
        railway_domain_id:   result.id,
        railway_cname_host:  result.dnsRecords.find((r) => r.recordType === 'CNAME')?.hostlabel  ?? null,
        railway_cname_value: result.dnsRecords.find((r) => r.recordType === 'CNAME')?.requiredValue ?? null,
        railway_txt_host:    result.dnsRecords.find((r) => r.recordType === 'TXT')?.hostlabel    ?? null,
        railway_txt_value:   result.dnsRecords.find((r) => r.recordType === 'TXT')?.requiredValue ?? null,
      })
      .eq('organization_id', orgId)

    // Return records from the registration call, with our own DNS check layered on top
    if (result.dnsRecords.length > 0) {
      return { records: await verifyCnameRecords(result.dnsRecords), error: null }
    }
  }

  if (!railwayDomainId) {
    return { records: null, error: 'No custom domain saved. Enter a domain name and click Save first.' }
  }

  const rawRecords = await getRailwayDomainStatus(railwayDomainId)
  if (!rawRecords) return { records: null, error: 'Could not reach Railway API. Check RAILWAY_API_TOKEN.' }

  // Layer our own DNS resolution check on top of Railway's status —
  // Railway's verification can lag minutes behind actual propagation.
  const records = await verifyCnameRecords(rawRecords)

  // Persist latest DNS records back to DB so the page load always shows both records
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service as any)
    .from('org_branding')
    .update({
      railway_cname_host:  records.find((r) => r.recordType === 'CNAME')?.hostlabel  ?? null,
      railway_cname_value: records.find((r) => r.recordType === 'CNAME')?.requiredValue ?? null,
      railway_txt_host:    records.find((r) => r.recordType === 'TXT')?.hostlabel    ?? null,
      railway_txt_value:   records.find((r) => r.recordType === 'TXT')?.requiredValue ?? null,
    })
    .eq('organization_id', orgId)

  return { records, error: null }
}

const VALID_SOUNDS = new Set(['ding', 'chime', 'beep', 'success', 'airhorn'])

export async function updateCheckinSound(
  orgId: string,
  sound: string | null,
): Promise<{ error: string | null }> {
  if (sound !== null && !VALID_SOUNDS.has(sound)) {
    return { error: 'Invalid sound selection' }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceRoleClient()

  const { data: member } = await service
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Unauthorized' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (service as any)
    .from('org_branding')
    .upsert({ organization_id: orgId, checkin_sound: sound }, { onConflict: 'organization_id' })

  if (error) return { error: error.message }

  revalidatePath('/admin/settings/branding')
  return { error: null }
}

export async function uploadOrgLogo(formData: FormData): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }
  if (file.size > 10 * 1024 * 1024) return { url: null, error: 'File must be under 10 MB' }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type)) {
    return { url: null, error: 'Unsupported file type' }
  }

  const bytes = await file.arrayBuffer()
  let converted: Awaited<ReturnType<typeof convertToWebP>> = null
  try {
    converted = await convertToWebP(bytes, file.type, { maxWidth: 800, maxHeight: 800 })
  } catch (err) {
    console.error('[uploadOrgLogo] convertToWebP failed, falling back to original:', err)
  }
  const uploadBytes = converted?.buffer ?? Buffer.from(bytes)
  const uploadType = converted?.contentType ?? file.type
  const ext = converted ? 'webp' : (file.name.split('.').pop() ?? 'png')
  const path = `${org.id}/logo.${ext}`

  const service = createServiceRoleClient()

  // Delete any existing logo files before uploading (extension may differ)
  const { data: existing } = await service.storage.from('org-branding').list(org.id)
  if (existing && existing.length > 0) {
    const toRemove = existing.map((f) => `${org.id}/${f.name}`)
    await service.storage.from('org-branding').remove(toRemove)
  }

  const { error: uploadError } = await service.storage
    .from('org-branding')
    .upload(path, uploadBytes, { contentType: uploadType, upsert: true })

  if (uploadError) return { url: null, error: uploadError.message }

  const { data: { publicUrl } } = service.storage.from('org-branding').getPublicUrl(path)

  // Bust the CDN cache by appending a timestamp
  const url = `${publicUrl}?t=${Date.now()}`

  await service
    .from('org_branding')
    .upsert({ organization_id: org.id, logo_url: url }, { onConflict: 'organization_id' })

  revalidatePath('/admin/settings/branding')
  revalidatePath('/', 'layout')
  revalidatePath('/login')

  return { url, error: null }
}
