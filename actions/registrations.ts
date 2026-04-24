'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { sendRegistrationConfirmation } from './emails'

const createRegistrationSchema = z.object({
  leagueId: z.string().uuid(),
  waiverSignatureId: z.string().uuid().optional(),
  formData: z.record(z.unknown()).optional(),
})

export async function createRegistration(input: z.infer<typeof createRegistrationSchema>) {
  const parsed = createRegistrationSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // Check for existing registration
  const { data: existing } = await supabase
    .from('registrations')
    .select('id, status')
    .eq('organization_id', org.id)
    .eq('league_id', parsed.data.leagueId)
    .eq('user_id', user.id)
    .single()

  if (existing) return { data: { registrationId: existing.id }, error: null }

  // Ensure org membership
  await supabase.from('org_members').upsert({
    organization_id: org.id,
    user_id: user.id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

  const { data, error } = await supabase
    .from('registrations')
    .insert({
      organization_id: org.id,
      league_id: parsed.data.leagueId,
      user_id: user.id,
      waiver_signature_id: parsed.data.waiverSignatureId ?? null,
      status: 'pending',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form_data: (parsed.data.formData ?? null) as any,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

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
