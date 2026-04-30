'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { sendRegistrationConfirmation } from './emails'
import { acceptDropInInvite } from './invites'

const createRegistrationSchema = z.object({
  leagueId: z.string().uuid(),
  waiverSignatureId: z.string().uuid().optional(),
  formData: z.record(z.string(), z.unknown()).optional(),
  position: z.string().optional(),
  registration_type: z.enum(['season', 'drop_in']).default('season'),
})

export async function createRegistration(input: z.infer<typeof createRegistrationSchema>) {
  const parsed = createRegistrationSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // Check for existing registration (skip dedup for drop-in — each invite creates a fresh reg)
  if (parsed.data.registration_type === 'season') {
    const { data: existing } = await supabase
      .from('registrations')
      .select('id, status')
      .eq('organization_id', org.id)
      .eq('league_id', parsed.data.leagueId)
      .eq('user_id', user.id)
      .eq('registration_type' as never, 'season')
      .single()

    if (existing) return { data: { registrationId: existing.id }, error: null }
  }

  // Ensure org membership
  await supabase.from('org_members').upsert({
    organization_id: org.id,
    user_id: user.id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

  const isDropIn = parsed.data.registration_type === 'drop_in'
  const expiresAt = isDropIn
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { data, error } = await supabase
    .from('registrations')
    .insert({
      organization_id: org.id,
      league_id: parsed.data.leagueId,
      user_id: user.id,
      waiver_signature_id: parsed.data.waiverSignatureId ?? null,
      status: 'pending',
      position: parsed.data.position ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form_data: (parsed.data.formData ?? null) as any,
      registration_type: parsed.data.registration_type,
      expires_at: expiresAt,
    } as never)
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  // Mark the drop-in invite as accepted so it can't be reused
  if (isDropIn && user.email) {
    await acceptDropInInvite(parsed.data.leagueId, user.email)
  }

  return { data: { registrationId: data.id }, error: null }
}

export async function linkWaiverToRegistration(registrationId: string, signatureId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('registrations')
    .update({ waiver_signature_id: signatureId })
    .eq('id', registrationId)
    .eq('organization_id', org.id)
    .eq('user_id', user.id) // players can only update their own

  if (error) return { error: error.message }
  return { error: null }
}

export async function removeRegistration(registrationId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const { createServiceRoleClient } = await import('@/lib/supabase/service')
  const db = createServiceRoleClient()

  // Fetch the registration to get the user_id before deleting
  const { data: reg, error: fetchError } = await db
    .from('registrations')
    .select('user_id')
    .eq('id', registrationId)
    .eq('organization_id', org.id)
    .single()

  if (fetchError || !reg) return { error: 'Registration not found' }

  // Remove from any team in this league
  const { data: teams } = await db
    .from('teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)

  if (teams && teams.length > 0) {
    const teamIds = teams.map(t => t.id)
    await db
      .from('team_members')
      .delete()
      .eq('user_id', reg.user_id)
      .in('team_id', teamIds)
  }

  const { error } = await db
    .from('registrations')
    .delete()
    .eq('id', registrationId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/registrations`)
  revalidatePath(`/admin/events/${leagueId}/teams`)
  return { error: null }
}

export async function activateRegistration(registrationId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()

  const { data: reg, error: fetchError } = await supabase
    .from('registrations')
    .select('*, profiles!registrations_user_id_fkey(full_name, email), leagues!registrations_league_id_fkey(name)')
    .eq('id', registrationId)
    .eq('organization_id', org.id)
    .single()

  if (fetchError || !reg) return { data: null, error: 'Registration not found' }

  const { error } = await supabase
    .from('registrations')
    .update({ status: 'active' })
    .eq('id', registrationId)

  if (error) return { data: null, error: error.message }

  const profile = Array.isArray(reg.profiles) ? reg.profiles[0] : reg.profiles
  const league = Array.isArray(reg.leagues) ? reg.leagues[0] : reg.leagues

  if (profile?.email && league?.name) {
    await sendRegistrationConfirmation({
      email: profile.email,
      name: profile.full_name,
      leagueName: league.name,
      orgName: org.name,
    })
  }

  revalidatePath('/dashboard')
  return { data: null, error: null }
}
