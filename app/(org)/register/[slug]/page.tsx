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

  // Verify drop-in invite — only required for non-dropin event types that use
  // the pickup_invites system. For dropin-type leagues, registration is open.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOpenDropIn = (league as any).league_type === 'dropin' || (league as any).event_type === 'drop_in'
  if (isDropIn && !isOpenDropIn) {
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

  const [{ data: playerDetails }, { data: existingReg }, { data: profile }, { data: connectAccount }, { data: captainTeam }, { data: rawTeams }] = await Promise.all([
    supabase.from('player_details').select('*').eq('organization_id', org.id).eq('user_id', user.id).single(),
    // For invite-based drop-ins, don't resume (each invite = fresh registration).
    // For open dropin-type events, resume existing registration like a normal event.
    isDropIn && !isOpenDropIn
      ? Promise.resolve({ data: null })
      : supabase.from('registrations')
          .select('id, status, waiver_signature_id')
          .eq('organization_id', org.id)
          .eq('league_id', league.id)
          .eq('user_id', user.id)
          .eq('registration_type' as never, 'season')
          .maybeSingle(),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('org_payment_settings').select('stripe_secret_key').eq('organization_id', org.id).maybeSingle(),
    // Check if the user is already on any team in this league (any role)
    supabase
      .from('team_members')
      .select('team_id, role, teams!team_members_team_id_fkey!inner(id, name, league_id)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('teams.league_id', league.id)
      .maybeSingle(),
    // Fetch teams for per-team events (player browse/join step)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (league as any).payment_mode === 'per_team'
      ? supabase
          .from('teams')
          .select('id, name, max_team_size, team_members!team_members_team_id_fkey(id)')
          .eq('league_id', league.id)
          .eq('organization_id', org.id)
          .eq('status', 'active')
          .order('name')
      : Promise.resolve({ data: [] }),
  ])

  const hasOnlinePayments = !!connectAccount?.stripe_secret_key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dropInPriceCents: number | null = (league as any).drop_in_price_cents ?? null

  // Check whether the team cap is reached so we can disable the captain path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueMaxTeams: number | null = (league as any).max_teams ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isPerTeamLeague = (league as any).payment_mode === 'per_team'
  const { count: currentTeamCount } = isPerTeamLeague && leagueMaxTeams !== null
    ? await supabase
        .from('teams')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .eq('status', 'active')
    : { count: null }

  const teamsAtCapacity = isPerTeamLeague && leagueMaxTeams !== null && (currentTeamCount ?? 0) >= leagueMaxTeams

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
    } else if (!needsPayment && waiverSigned) {
      // Waiver was signed in a prior session and no payment needed — safe to auto-activate
      const service = createServiceRoleClient()
      await service.from('registrations').update({ status: 'active' }).eq('id', existingReg.id)
      redirect(`/register/${slug}/success`)
    } else if (!needsPayment) {
      // No payment needed and no waiver signed yet (or no waiver required) —
      // resume at step 2 so the user explicitly confirms rather than being
      // silently activated if they navigated away mid-flow.
      initialStep = 2
    } else {
      initialStep = 3
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myTeamRow = captainTeam as any
  const myTeamInfo = myTeamRow
    ? (() => { const t = myTeamRow.teams; return Array.isArray(t) ? t[0] : t })()
    : null
  const myTeamId = myTeamInfo?.id ?? null
  const myTeamName = myTeamInfo?.name ?? null
  const myTeamRole = myTeamRow?.role ?? null

  const captainTeamId = myTeamRole === 'captain' ? myTeamId : null
  const captainTeamName = myTeamRole === 'captain' ? myTeamName : null
  // Already on a team as a non-captain (e.g. accepted a team invite)
  const playerTeamId = myTeamRole && myTeamRole !== 'captain' ? myTeamId : null
  const playerTeamName = myTeamRole && myTeamRole !== 'captain' ? myTeamName : null

  // Shape teams for the player browse/join step
  const leagueTeams = (rawTeams ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    memberCount: Array.isArray(t.team_members) ? t.team_members.length : 0,
    maxSize: t.max_team_size ?? null,
  }))

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
      captainTeamName={captainTeamName}
      playerTeamId={playerTeamId}
      playerTeamName={playerTeamName}
      teamsAtCapacity={teamsAtCapacity}
      leagueTeams={leagueTeams}
    />
  )
}
