import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { RegistrationFlow } from '@/components/registration/registration-flow'

export default async function RegisterLeaguePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/register/${slug}`)

  // Fetch league first so we have its id for downstream queries
  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('organization_id', org.id)
    .eq('slug', slug)
    .eq('status', 'registration_open')
    .single()

  if (!league) notFound()

  const [{ data: playerDetails }, { data: existingReg }, { data: profile }, { data: connectAccount }] = await Promise.all([
    supabase.from('player_details').select('*').eq('organization_id', org.id).eq('user_id', user.id).single(),
    supabase.from('registrations')
      .select('id, status, waiver_signature_id')
      .eq('organization_id', org.id)
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('stripe_connect_accounts').select('charges_enabled').eq('organization_id', org.id).maybeSingle(),
  ])

  const hasOnlinePayments = !!connectAccount?.charges_enabled

  // Use the league's specific waiver if set, otherwise fall back to the org-wide active waiver
  let waiver = null
  if (league.waiver_version_id) {
    const { data } = await supabase.from('waivers').select('*').eq('id', league.waiver_version_id).single()
    waiver = data
  } else {
    const { data } = await supabase.from('waivers').select('*').eq('organization_id', org.id).eq('is_active', true).single()
    waiver = data
  }

  // Determine the right step to resume at if the player has an existing registration
  let initialStep = 1
  let initialRegistrationId: string | null = null

  if (existingReg) {
    initialRegistrationId = existingReg.id

    const waiverSigned = !!existingReg.waiver_signature_id

    // Check if they have a completed payment
    const { data: payment } = await supabase
      .from('payments')
      .select('status')
      .eq('registration_id', existingReg.id)
      .maybeSingle()

    const paymentComplete = payment?.status === 'paid'
    const needsPayment = league.price_cents > 0 && hasOnlinePayments && !paymentComplete

    if (existingReg.status === 'active' && !needsPayment) {
      redirect(`/register/${slug}/success`)
    } else if (needsPayment && (waiverSigned || !waiver)) {
      initialStep = 3 // jump to payment
    } else if (waiver && !waiverSigned) {
      initialStep = 2 // jump to waiver
    } else {
      initialStep = needsPayment ? 3 : 4
    }
  }

  return (
    <RegistrationFlow
      org={org}
      league={league}
      waiver={waiver}
      profile={profile}
      playerDetails={playerDetails}
      userId={user.id}
      initialStep={initialStep}
      initialRegistrationId={initialRegistrationId}
      hasOnlinePayments={hasOnlinePayments}
    />
  )
}
