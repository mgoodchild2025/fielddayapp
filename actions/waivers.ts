'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { createRateLimiter } from '@/lib/rate-limit'
import { assertOrgAdmin } from '@/lib/auth'

// 5 waiver signing attempts per 10 minutes per IP — enough for any legitimate
// player, tight enough to prevent automated bulk signing.
const signingLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 5 })

// ─── Admin: create / update waiver ───────────────────────────────────────────

const upsertWaiverSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2),
  content: z.string().min(10),
})

export async function upsertWaiver(input: z.infer<typeof upsertWaiverSchema>) {
  const parsed = upsertWaiverSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org, ['org_admin', 'league_admin'])
  if (auth.error) return { data: null, error: auth.error }
  const supabase = await createServerClient()

  if (parsed.data.id) {
    // Update existing — bump version
    const { data: current } = await supabase
      .from('waivers')
      .select('version')
      .eq('id', parsed.data.id)
      .eq('organization_id', org.id)
      .single()

    const { data, error } = await supabase
      .from('waivers')
      .update({
        title: parsed.data.title,
        content: parsed.data.content,
        version: (current?.version ?? 1) + 1,
      })
      .eq('id', parsed.data.id)
      .eq('organization_id', org.id)
      .select('id')
      .single()

    if (error) return { data: null, error: error.message }
    revalidatePath('/admin/settings')
    return { data, error: null }
  }

  // Deactivate any existing active waivers first
  await supabase
    .from('waivers')
    .update({ is_active: false })
    .eq('organization_id', org.id)
    .eq('is_active', true)

  // Insert new
  const { data, error } = await supabase
    .from('waivers')
    .insert({
      organization_id: org.id,
      title: parsed.data.title,
      content: parsed.data.content,
      is_active: true,
      version: 1,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }
  revalidatePath('/admin/settings')
  return { data, error: null }
}

export async function setWaiverActive(waiverId: string, active: boolean) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org, ['org_admin', 'league_admin'])
  if (auth.error) return { error: auth.error }
  const supabase = await createServerClient()

  if (active) {
    // Deactivate others first
    await supabase
      .from('waivers')
      .update({ is_active: false })
      .eq('organization_id', org.id)
  }

  const { error } = await supabase
    .from('waivers')
    .update({ is_active: active })
    .eq('id', waiverId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings')
  return { error: null }
}

// ─── Admin: delete waiver ─────────────────────────────────────────────────────

export async function getWaiverSignatureCount(waiverId: string): Promise<number> {
  const supabase = await createServerClient()
  const { count } = await supabase
    .from('waiver_signatures')
    .select('id', { count: 'exact', head: true })
    .eq('waiver_id', waiverId)
  return count ?? 0
}

export async function deleteWaiver(waiverId: string, force = false) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  // Only org_admin can delete waivers (not league_admin — too destructive)
  const auth = await assertOrgAdmin(org, ['org_admin'])
  if (auth.error) return { error: auth.error }
  const supabase = await createServerClient()

  // Block deletion if any player has already signed this waiver (unless force=true)
  const { count } = await supabase
    .from('waiver_signatures')
    .select('id', { count: 'exact', head: true })
    .eq('waiver_id', waiverId)

  if ((count ?? 0) > 0 && !force) {
    return {
      error: `This waiver has been signed by ${count} player${count === 1 ? '' : 's'} and cannot be deleted. You can create a new version instead.`,
    }
  }

  // If force=true, sever FK references then delete signatures
  if (force && (count ?? 0) > 0) {
    const serviceClient = createServiceRoleClient()

    // 1. Fetch the signature IDs for this waiver so we can null out registrations
    const { data: sigs } = await serviceClient
      .from('waiver_signatures')
      .select('id')
      .eq('waiver_id', waiverId)

    const sigIds = (sigs ?? []).map((s: { id: string }) => s.id)

    // 2. Null out registrations.waiver_signature_id for those signatures
    if (sigIds.length > 0) {
      const { error: regNullError } = await serviceClient
        .from('registrations')
        .update({ waiver_signature_id: null })
        .in('waiver_signature_id', sigIds)
      if (regNullError) return { error: regNullError.message }
    }

    // 3. Now it's safe to delete the signatures
    const { error: sigDeleteError } = await serviceClient
      .from('waiver_signatures')
      .delete()
      .eq('waiver_id', waiverId)
    if (sigDeleteError) return { error: sigDeleteError.message }
  }

  // Clear this waiver from any leagues that reference it (revert to "No waiver required")
  await supabase
    .from('leagues')
    .update({ waiver_version_id: null })
    .eq('organization_id', org.id)
    .eq('waiver_version_id', waiverId)

  const { error } = await supabase
    .from('waivers')
    .delete()
    .eq('id', waiverId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings/waivers')
  revalidatePath('/admin/events')
  return { error: null }
}

// ─── Player: sign waiver ─────────────────────────────────────────────────────

const signWaiverSchema = z.object({
  waiverId: z.string().uuid(),
  signatureName: z.string().min(2),
  leagueId: z.string().uuid().optional(),
  leagueName: z.string().optional(),
  // When present, the registration row is linked server-side (avoids client-side
  // linkWaiverToRegistration call being dropped by a network failure).
  registrationId: z.string().uuid().optional(),
  // Guardian fields — present only when the player is under 18.
  // signatureName holds the guardian's legal name; guardianRelationship identifies them.
  guardianRelationship: z.enum(['parent', 'legal_guardian']).optional(),
})

export async function signWaiver(input: z.infer<typeof signWaiverSchema>) {
  const parsed = signWaiverSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  // Capture the real client IP (works behind proxies / Vercel)
  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
    headersList.get('x-real-ip') ??
    null

  // Rate limit by IP to prevent automated bulk signing
  const rateLimitKey = ipAddress ?? 'unknown'
  const { limited } = signingLimiter.check(rateLimitKey)
  if (limited) return { data: null, error: 'Too many requests. Please wait a few minutes and try again.' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // Check for an existing signature scoped to this specific event.
  // Each event now gets its own signature row (UNIQUE(user_id, waiver_id, league_id))
  // so signing the same waiver for a different event always creates a fresh record
  // with an accurate timestamp for that event.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingQuery = (supabase as any)
    .from('waiver_signatures')
    .select('id')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('waiver_id', parsed.data.waiverId)

  if (parsed.data.leagueId) {
    existingQuery.eq('league_id', parsed.data.leagueId)
  }

  const { data: existing } = await existingQuery.maybeSingle()

  let signatureId: string

  if (existing) {
    signatureId = existing.id
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('waiver_signatures')
      .insert({
        organization_id: org.id,
        user_id: user.id,
        waiver_id: parsed.data.waiverId,
        signature_name: parsed.data.signatureName,
        ip_address: ipAddress,
        league_id: parsed.data.leagueId ?? null,
        league_name: parsed.data.leagueName ?? null,
        guardian_relationship: parsed.data.guardianRelationship ?? null,
      })
      .select('id')
      .single()

    if (error) return { data: null, error: error.message }
    signatureId = data.id
  }

  // Link the signature to the player's registration for this event.
  if (parsed.data.leagueId) {
    await supabase
      .from('registrations')
      .update({ waiver_signature_id: signatureId })
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('league_id', parsed.data.leagueId)
      .is('waiver_signature_id', null)
  }

  // Also link by registration ID when provided — fires even on the dedup path,
  // re-linking a previously signed waiver to a new registration row.
  if (parsed.data.registrationId) {
    await supabase
      .from('registrations')
      .update({ waiver_signature_id: signatureId })
      .eq('id', parsed.data.registrationId)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
  }

  return { data: { signatureId }, error: null }
}

// ─── Guest: sign waiver without an account ────────────────────────────────────

const signWaiverGuestSchema = z.object({
  waiverId:             z.string().uuid(),
  leagueId:             z.string().uuid(),
  leagueName:           z.string(),
  orgId:                z.string().uuid(),
  guestName:            z.string().min(2),
  guestEmail:           z.string().email(),
  teamName:             z.string().optional(),
  signatureName:        z.string().min(2),
  guardianRelationship: z.enum(['parent', 'legal_guardian']).optional(),
})

export async function signWaiverAsGuest(input: z.infer<typeof signWaiverGuestSchema>) {
  const parsed = signWaiverGuestSchema.safeParse(input)
  if (!parsed.success) return { data: null, alreadySigned: false, error: 'Invalid input' }

  const headersList = await headers()

  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
    headersList.get('x-real-ip') ??
    null

  // Rate-limit by IP (same budget as authenticated signing)
  const rateLimitKey = ipAddress ?? 'unknown'
  const { limited } = signingLimiter.check(rateLimitKey)
  if (limited) return { data: null, alreadySigned: false, error: 'Too many requests. Please wait a few minutes and try again.' }

  const db = createServiceRoleClient()
  const email = parsed.data.guestEmail.toLowerCase()

  // Verify waiver belongs to this org
  const { data: waiver } = await db
    .from('waivers')
    .select('id')
    .eq('id', parsed.data.waiverId)
    .eq('organization_id', parsed.data.orgId)
    .single()
  if (!waiver) return { data: null, alreadySigned: false, error: 'Waiver not found' }

  // Idempotency: if same email already signed this waiver for this league, return success
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (db as any)
    .from('waiver_signatures')
    .select('id')
    .eq('organization_id', parsed.data.orgId)
    .eq('waiver_id', parsed.data.waiverId)
    .eq('league_id', parsed.data.leagueId)
    .ilike('guest_email', email)
    .is('user_id', null)
    .maybeSingle()

  if (existing) {
    return { data: { signatureId: existing.id }, alreadySigned: true, error: null }
  }

  // If this email belongs to an existing profile, use the normal auth path instead
  // so the signature shows up in their account history.
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (profile?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: authExisting } = await (db as any)
      .from('waiver_signatures')
      .select('id')
      .eq('organization_id', parsed.data.orgId)
      .eq('user_id', profile.id)
      .eq('waiver_id', parsed.data.waiverId)
      .eq('league_id', parsed.data.leagueId)
      .maybeSingle()

    if (authExisting) {
      return { data: { signatureId: authExisting.id }, alreadySigned: true, error: null }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newSig, error: sigErr } = await (db as any)
      .from('waiver_signatures')
      .insert({
        organization_id: parsed.data.orgId,
        user_id: profile.id,
        waiver_id: parsed.data.waiverId,
        league_id: parsed.data.leagueId,
        league_name: parsed.data.leagueName,
        team_name: parsed.data.teamName ?? null,
        signature_name: parsed.data.signatureName,
        ip_address: ipAddress,
        guardian_relationship: parsed.data.guardianRelationship ?? null,
      })
      .select('id')
      .single()

    if (sigErr) return { data: null, alreadySigned: false, error: sigErr.message }

    // Link to their registration if one exists
    await db
      .from('registrations')
      .update({ waiver_signature_id: newSig.id })
      .eq('organization_id', parsed.data.orgId)
      .eq('user_id', profile.id)
      .eq('league_id', parsed.data.leagueId)
      .is('waiver_signature_id', null)

    return { data: { signatureId: newSig.id }, alreadySigned: false, error: null }
  }

  // Pure guest insert (no matching account)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newSig, error: sigErr } = await (db as any)
    .from('waiver_signatures')
    .insert({
      organization_id: parsed.data.orgId,
      user_id: null,
      guest_name: parsed.data.guestName,
      guest_email: email,
      waiver_id: parsed.data.waiverId,
      league_id: parsed.data.leagueId,
      league_name: parsed.data.leagueName,
      team_name: parsed.data.teamName ?? null,
      signature_name: parsed.data.signatureName,
      ip_address: ipAddress,
      guardian_relationship: parsed.data.guardianRelationship ?? null,
    })
    .select('id')
    .single()

  if (sigErr) return { data: null, alreadySigned: false, error: sigErr.message }

  return { data: { signatureId: newSig.id }, alreadySigned: false, error: null }
}

// ─── Waiver PDF upload ────────────────────────────────────────────────────────

export async function uploadWaiverPdf(
  waiverId: string,
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org, ['org_admin'])
  if (auth.error) return { url: null, error: auth.error }

  const file = formData.get('pdf') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }
  if (file.size > 10 * 1024 * 1024) return { url: null, error: 'File must be under 10 MB' }
  if (file.type !== 'application/pdf') return { url: null, error: 'PDF files only' }

  const db = createServiceRoleClient()
  const path = `${org.id}/waivers/${waiverId}/waiver.pdf`

  const { error: upErr } = await db.storage
    .from('org-documents')
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (upErr) return { url: null, error: upErr.message }

  const { data: { publicUrl } } = db.storage.from('org-documents').getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`

  await db.from('waivers').update({ pdf_url: url } as never).eq('id', waiverId).eq('organization_id', org.id)

  revalidatePath('/admin/settings/waivers')
  return { url, error: null }
}

export async function removeWaiverPdf(
  waiverId: string,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org, ['org_admin'])
  if (auth.error) return { error: auth.error }

  const db = createServiceRoleClient()
  const path = `${org.id}/waivers/${waiverId}/waiver.pdf`
  await db.storage.from('org-documents').remove([path])
  await db.from('waivers').update({ pdf_url: null } as never).eq('id', waiverId).eq('organization_id', org.id)

  revalidatePath('/admin/settings/waivers')
  return { error: null }
}
