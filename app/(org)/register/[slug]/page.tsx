import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { RegistrationFlow } from '@/components/registration/registration-flow'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPositionsForSport } from '@/actions/positions'

export default async function RegisterLeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ mode?: string }>
}) {
  const { slug } = await params
  const { mode } = await searchParams
  const isDropIn = mode === 'drop_in'
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/register/${slug}${isDropIn ? '?mode=drop_in' : ''}`)

  // Drop-ins can register for active events; season players need registration_open
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (supabase as any)
    .from('leagues')
    .select('*')
    .eq('organization_id', org.id)
    .eq('slug', slug)
    .in('status', isDropIn ? ['registration_open', 'active'] : ['registration_open'])
    .single()

  if (!league) notFound()

  // Verify drop-in invite
  if (isDropIn) {
    if (!user.email) notFound()
    const { createServiceRoleClient } = await import('@/lib/supabase/service')
    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite } = await (db as any)
      .from('pickup_invites')
      .select('id')
      .eq('league_id', league.id)
      .eq('email', user.email.toLowerCase())
      .eq('invite_type', 'drop_in')
      .eq('status', 'pending')
      .maybeSingle()
    if (!invite) notFound()
  }

  const [{ data: playerDetails }, { data: existingReg }, { data: profile }, { data: connectAccount }, { data: captainTeam }] = await Promise.all([
    supabase.from('player_details').select('*').eq('organization_id', org.id).eq('user_id', user.id).single(),
    // For drop-ins, don't resume an existing reg (each invite = fresh registration)
    isDropIn
      ? Promise.resolve({ data: null })
      : supabase.from('registrations')
          .select('id, status, waiver_signature_id')
          .eq('organization_id', org.id)
          .eq('league_id', league.id)
          .eq('user_id', user.id)
          .eq('registration_type' as never, 'season')
          .maybeSingle(),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('stripe_connect_accounts').select('charges_enabled').eq('organization_id', org.id).maybeSingle(),
    // Check if the user is already a captain for a team in this league
    supabase
      .from('team_members')
      .select('team_id, teams!team_members_team_id_fkey(id, name)')
      .eq('user_id', user.id)
      .eq('role', 'captain')
      .eq('status', 'active')
      .maybeSingle(),
  ])

  const hasOnlinePayments = !!connectAccount?.charges_enabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dropInPriceCents: number | null = (league as any).drop_in_price_cents ?? null

  const positions = await getPositionsForSport(org.id, league.sport ?? '')

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
    const effectivePrice = isDropIn ? (dropInPriceCents ?? 0) : league.price_cents
    const needsPayment = effectivePrice > 0 && hasOnlinePayments && !paymentComplete

    if (existingReg.status === 'active' && !needsPayment) {
      redirect(`/register/${slug}/success`)
    } else if (needsPayment && (waiverSigned || !waiver)) {
      initialStep = 3 // jump to payment
    } else if (waiver && !waiverSigned) {
      initialStep = 2 // jump to waiver
    } else if (!needsPayment) {
      // Waiver signed (or not required), no payment needed — activate server-side and redirect
      const service = createServiceRoleClient()
      await service.from('registrations').update({ status: 'active' }).eq('id', existingReg.id)
      redirect(`/register/${slug}/success`)
    } else {
      initialStep = 3
    }
  }

  const captainTeamRow = captainTeam
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (() => { const t = (captainTeam as any).teams; return Array.isArray(t) ? t[0] : t })()
    : null
  const captainTeamId = captainTeamRow?.id ?? null

  return (
    <RegistrationFlow
      org={org}
      league={league as never}
      waiver={waiver}
      profile={profile}
      playerDetails={playerDetails}
      userId={user.id}
      initialStep={initialStep}
      initialRegistrationId={initialRegistrationId}
      hasOnlinePayments={hasOnlinePayments}
      positions={positions}
      isDropIn={isDropIn}
      dropInPriceCents={dropInPriceCents}
      captainTeamId={captainTeamId}
    />
  )
}
