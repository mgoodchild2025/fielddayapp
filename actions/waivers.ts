'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

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

export async function deleteWaiver(waiverId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

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

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // Check for existing signature for this waiver (re-use if already signed)
  const { data: existing } = await supabase
    .from('waiver_signatures')
    .select('id')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('waiver_id', parsed.data.waiverId)
    .maybeSingle()

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
        guardian_relationship: parsed.data.guardianRelationship ?? null,
      })
      .select('id')
      .single()

    if (error) return { data: null, error: error.message }
    signatureId = data.id
  }

  // Link the signature to the registration row server-side so the write is atomic
  // and can't be dropped by a client network failure. Runs even when dedup-guard
  // short-circuited above (re-links an already-signed waiver to a new registration).
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
