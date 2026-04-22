import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { RegistrationFlow } from '@/components/registration/registration-flow'

export default async function RegisterLeaguePage({
  params,
}: {
  params: { slug: string }
}) {
  const headersList = headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/register/${params.slug}`)

  const [{ data: league }, { data: waiver }, { data: playerDetails }, { data: existingReg }] = await Promise.all([
    supabase.from('leagues').select('*').eq('organization_id', org.id).eq('slug', params.slug).eq('status', 'registration_open').single(),
    supabase.from('waivers').select('*').eq('organization_id', org.id).eq('is_active', true).single(),
    supabase.from('player_details').select('*').eq('organization_id', org.id).eq('user_id', user.id).single(),
    supabase.from('registrations').select('id, status').eq('organization_id', org.id).eq('league_id', '').eq('user_id', user.id).maybeSingle(),
  ])

  if (!league) notFound()

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  return (
    <RegistrationFlow
      org={org}
      league={league}
      waiver={waiver}
      profile={profile}
      playerDetails={playerDetails}
      userId={user.id}
    />
  )
}
