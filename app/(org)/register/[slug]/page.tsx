import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { RegistrationFlow } from '@/components/registration/registration-flow'
import { GuestRegistrationFlow } from '@/components/registration/guest-registration-flow'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPositionsForSport } from '@/actions/positions'
import { getLeagueMerchandise } from '@/actions/merchandise'
import type { MerchItemForStep } from '@/components/registration/step-addons'
import { resolveLeagueMethods } from '@/lib/payment-methods'
import { canAccess } from '@/lib/features'

export default async function RegisterLeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ mode?: string; code?: string; session?: string; key?: string }>
}) {
  const { slug } = await params
  const { mode, code: teamCodeParam, session: sessionParam, key: keyParam } = await searchParams
  const initialTeamCode = teamCodeParam?.trim().toUpperCase() ?? null
  const isDropIn = mode === 'drop_in'
  // Pre-selected session from the event page "Register to join" button
  const preselectedSessionId = isDropIn && sessionParam ? sessionParam : null
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()

  // registration_open: open to all. active: only team-invited players (guard below).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('*')
    .eq('organization_id', org.id)
    .eq('slug', slug)
    .in('status', ['registration_open', 'active'])
    .single()

  if (!league) notFound()

  // ── Event join policy (drop-in / pickup) ──────────────────────────────────
  // Team join policy governs team events only; drop-in/pickup use the event
  // (pickup) policy: public = anyone · link = needs the group link (access_token)
  // · private = individual invite (pickup_invites).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isPickupType = (league as any).event_type === 'drop_in'
    || (league as any).event_type === 'pickup'
    || (league as any).league_type === 'dropin'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventPolicy: string = isPickupType ? ((league as any).pickup_join_policy ?? 'public') : 'public'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasValidKey = eventPolicy === 'link' && !!keyParam && keyParam === (league as any).access_token
  // Preserves drop-in mode (and the group-link key) through login / redirects.
  const dropInQuery = `?mode=drop_in${eventPolicy === 'link' && keyParam ? `&key=${encodeURIComponent(keyParam)}` : ''}`

  // Guests (no account) may self-register for open drop-in events (public, or a
  // valid group link) — offer them a sign-in vs. continue-as-guest choice.
  const guestEligible = isPickupType && (eventPolicy === 'public' || hasValidKey)

  if (!user) {
    if (isDropIn && guestEligible) {
      const [{ data: gBranding }, { data: gSettings }, gWaiver, { data: gRawSessions }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from('org_payment_settings').select('stripe_secret_key, registration_payment_mode, registration_manual_instructions').eq('organization_id', org.id).maybeSingle(),
        (async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sel = (q: any) => q.select('id, title, content')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((league as any).waiver_version_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await sel((db as any).from('waivers')).eq('id', (league as any).waiver_version_id).maybeSingle()
            return data
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await sel((db as any).from('waivers')).eq('organization_id', org.id).eq('is_active', true).maybeSingle()
          return data
        })(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from('event_sessions')
          .select('id, scheduled_at, capacity, registered:session_registrations(count)')
          .eq('league_id', league.id).eq('organization_id', org.id).eq('status', 'open')
          .gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true }).limit(20),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gSessions = (gRawSessions ?? []).map((s: any) => ({
        id: s.id, scheduled_at: s.scheduled_at, capacity: s.capacity,
        registered_count: s.registered?.[0]?.count ?? 0,
      }))
      const gOnline = !!gSettings?.stripe_secret_key && (gSettings?.registration_payment_mode ?? 'stripe') !== 'manual'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gPrice = (league as any).drop_in_price_cents ?? (league as any).price_cents ?? 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gManual = ((league as any).payment_instructions?.trim() || null) ?? (gSettings?.registration_manual_instructions ?? null)

      return (
        <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
          <OrgNav org={org} logoUrl={gBranding?.logo_url ?? null} />
          <div className="max-w-md mx-auto w-full px-5 py-10 flex-1">
            <GuestRegistrationFlow
              org={{ id: org.id, name: org.name, slug: org.slug }}
              league={{ id: league.id, name: league.name, slug: league.slug, sport: league.sport ?? null }}
              waiver={gWaiver ? { id: gWaiver.id, title: gWaiver.title, content: gWaiver.content } : null}
              sessions={gSessions}
              preselectedSessionId={preselectedSessionId}
              priceCents={gPrice}
              currency={(league as any).currency ?? 'cad'}
              onlinePayments={gOnline}
              manualInstructions={gManual}
              timezone={gBranding?.timezone ?? 'America/Toronto'}
              loginHref={`/login?redirect=${encodeURIComponent(`/register/${slug}${dropInQuery}`)}`}
            />
          </div>
          <Footer org={org} />
        </div>
      )
    }
    redirect(`/login?redirect=${encodeURIComponent(`/register/${slug}${isDropIn ? dropInQuery : ''}`)}`)
  }

  // ── Team join policy enforcement ──────────────────────────────────────────
  // Org admins bypass all policy gates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgMemberCheck } = await (db as any)
    .from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).maybeSingle()
  const isOrgAdminCheck = ['org_admin', 'league_admin'].includes(orgMemberCheck?.role ?? '')

  // Team join policy only governs team events (leagues/tournaments). Drop-in /
  // pickup events use the event join policy below — never team_join_policy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joinPolicy = isPickupType ? null : ((league as any).team_join_policy as string | null)
  if (!isOrgAdminCheck && joinPolicy === 'admin_only') {
    redirect(`/events/${slug}?join=restricted`)
  }
  if (!isOrgAdminCheck && joinPolicy === 'captain_invite') {
    // Allow if the user already has an active team membership or a pending invitation in this league
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: teamRows } = await (db as any)
      .from('teams').select('id').eq('league_id', (league as any).id).eq('organization_id', org.id)
    const teamIds = (teamRows ?? []).map((t: { id: string }) => t.id) as string[]

    const [{ data: membership }, { data: invitation }] = teamIds.length > 0
      ? await Promise.all([
          db.from('team_members').select('id').eq('user_id', user.id).in('team_id', teamIds).eq('status', 'active').limit(1).maybeSingle(),
          user.email
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (db as any).from('team_invitations').select('id').in('team_id', teamIds).eq('invited_email', user.email.toLowerCase()).eq('status', 'pending').limit(1).maybeSingle()
            : Promise.resolve({ data: null }),
        ])
      : [{ data: null }, { data: null }]

    if (!membership && !invitation) {
      redirect(`/events/${slug}?join=invite_required`)
    }
  }

  // Enforce the event join policy for drop-in / pickup registration:
  //   public — open · link — requires the group-link key · private — needs an invite
  const isOpenDropIn = eventPolicy === 'public' || hasValidKey
  if (isPickupType && !isOpenDropIn) {
    if (eventPolicy === 'link') {
      // Reached without the group link (e.g. via the event page) — send them back
      // with a message telling them to use the link the organizer shared.
      redirect(`/events/${slug}?join=link_required`)
    }
    // private — individual invite required (matched by email)
    if (!user.email) notFound()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite } = await (db as any)
      .from('pickup_invites')
      .select('id')
      .eq('league_id', league.id)
      .eq('email', user.email.toLowerCase())
      .eq('invite_type', 'drop_in')
      .eq('status', 'pending')
      .maybeSingle()
    if (!invite) redirect(`/events/${slug}?join=invite_required`)
  }

  const [{ data: playerDetails }, { data: existingReg }, { data: profile }, { data: connectAccount }, { data: captainTeam }, { data: rawTeams }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('player_details').select('*').eq('organization_id', org.id).eq('user_id', user.id).single(),
    // For invite-based drop-ins, don't resume (each invite = fresh registration).
    // For open dropin-type events, resume existing registration like a normal event.
    isDropIn && !isOpenDropIn
      ? Promise.resolve({ data: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (db as any).from('registrations')
          .select('id, status, waiver_signature_id')
          .eq('organization_id', org.id)
          .eq('league_id', league.id)
          .eq('user_id', user.id)
          .eq('registration_type', 'season')
          .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('profiles').select('*').eq('id', user.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_payment_settings').select('stripe_secret_key, registration_payment_mode, registration_manual_instructions').eq('organization_id', org.id).maybeSingle(),
    // Check if the user is already on any team in this league (any role).
    // Query starts from teams so league_id is filtered on the primary table (reliable).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('teams')
      .select('id, name, team_members!inner(role)')
      .eq('league_id', league.id)
      .eq('organization_id', org.id)
      .eq('team_members.user_id', user.id)
      .eq('team_members.status', 'active')
      .maybeSingle(),
    // Fetch teams for per-team events (player browse/join step)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (league as any).payment_mode === 'per_team'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (db as any)
          .from('teams')
          .select('id, name, max_team_size, team_members!team_members_team_id_fkey(id)')
          .eq('league_id', league.id)
          .eq('organization_id', org.id)
          .eq('status', 'active')
          .order('name')
      : Promise.resolve({ data: [] }),
  ])

  // For active leagues: only allow access if the player is already on a team
  // (accepted a mid-season invite) or has an existing registration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!isDropIn && (league as any).status === 'active' && !captainTeam && !existingReg) {
    // captainTeam uses the auth client which may be limited by RLS — use service role
    // as an authoritative fallback before blocking the player.
    const svcDb = createServiceRoleClient()
    const { data: leagueTeamIds } = await svcDb
      .from('teams')
      .select('id')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('league_id', (league as any).id)
      .eq('organization_id', org.id)
    const teamIds = (leagueTeamIds ?? []).map((t: { id: string }) => t.id)
    const hasTeamMembership = teamIds.length > 0
      ? !!(await svcDb
          .from('team_members')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .in('team_id', teamIds)
          .maybeSingle()).data
      : false
    if (!hasTeamMembership) notFound()
  }

  // Online payments require both a Stripe secret key AND the registration payment mode
  // set to 'stripe' (null/undefined defaults to 'stripe' for backwards compatibility).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registrationPaymentMode = (connectAccount as any)?.registration_payment_mode ?? 'stripe'
  const hasOnlinePayments = !!connectAccount?.stripe_secret_key && registrationPaymentMode !== 'manual'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgManualInstructions: string | null = (connectAccount as any)?.registration_manual_instructions ?? null

  // Per-league accepted methods (resolved, with legacy org fallback). When the
  // league has no explicit config this returns ['card'] or ['etransfer','cash'].
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acceptedMethods = resolveLeagueMethods((league as any).payment_methods, connectAccount as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offlineInstructions: string | null = ((league as any).payment_instructions?.trim() || null) ?? orgManualInstructions
  const manualPaymentInstructions: string | null = orgManualInstructions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dropInPriceCents: number | null = (league as any).drop_in_price_cents ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const earlyBirdPriceCents: number | null = (league as any).early_bird_price_cents ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const earlyBirdDeadline: string | null = (league as any).early_bird_deadline ?? null

  // Check whether the team cap is reached so we can disable the captain path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueMaxTeams: number | null = (league as any).max_teams ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isPerTeamLeague = (league as any).payment_mode === 'per_team'
  const { count: currentTeamCount } = isPerTeamLeague && leagueMaxTeams !== null
    ? await db
        .from('teams')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .eq('status', 'active')
    : { count: null }

  const teamsAtCapacity = isPerTeamLeague && leagueMaxTeams !== null && (currentTeamCount ?? 0) >= leagueMaxTeams

  // Fetch upcoming sessions for drop-in registration (session picker step)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawSessions } = isDropIn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (db as any)
        .from('event_sessions')
        .select('id, scheduled_at, capacity, registered:session_registrations(count)')
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .eq('status', 'open')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(20)
    : { data: [] }

  const dropInSessions = (rawSessions ?? []).map((s: {
    id: string
    scheduled_at: string
    capacity: number | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registered: any[]
  }) => ({
    id: s.id,
    scheduled_at: s.scheduled_at,
    capacity: s.capacity,
    registered_count: s.registered?.[0]?.count ?? 0,
  }))

  const [positions, leagueMerchRaw, hasPaymentPlans] = await Promise.all([
    getPositionsForSport(org.id, league.sport ?? ''),
    getLeagueMerchandise(league.id),
    canAccess(org.id, 'payment_plans'),
  ])

  // Fetch active payment plan for this league (only when org has the feature)
  type PaymentPlanRow = { id: string; name: string; installments: number; interval_days: number; upfront_percent: number }
  let paymentPlan: PaymentPlanRow | null = null
  if (hasPaymentPlans && !isDropIn && !isPerTeamLeague) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: planRow } = await (db as any)
      .from('payment_plans')
      .select('id, name, installments, interval_days, upfront_percent')
      .eq('league_id', league.id)
      .eq('organization_id', org.id)
      .eq('enabled', true)
      .maybeSingle()
    paymentPlan = planRow ?? null
  }

  // Map LeagueMerchItem (with available_stock + effective_price_cents) to the
  // shape the registration flow and add-ons step expect.
  const leagueMerch: MerchItemForStep[] = leagueMerchRaw.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price_cents: item.price_cents,
    effective_price_cents: item.effective_price_cents,
    currency: item.currency,
    image_url: item.image_url,
    variants: item.variants.map((v) => ({
      id: v.id,
      label: v.label,
      available_stock: v.available_stock,
    })),
  }))

  // Use the league's specific waiver if set, otherwise fall back to the org-wide active waiver
  let waiver = null
  if (league.waiver_version_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any).from('waivers').select('*').eq('id', league.waiver_version_id).single()
    waiver = data
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any).from('waivers').select('*').eq('organization_id', org.id).eq('is_active', true).single()
    waiver = data
  }

  // Drop-in players who already signed this org's waiver earlier this calendar
  // year don't need to sign again — reuse that signature and skip the step.
  let priorWaiverSignatureId: string | null = null
  if (isDropIn && waiver) {
    const yearStart = `${new Date().getFullYear()}-01-01`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: priorSig } = await (db as any)
      .from('waiver_signatures')
      .select('id')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('waiver_id', waiver.id)
      .gte('signed_at', yearStart)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    priorWaiverSignatureId = priorSig?.id ?? null
  }

  // Org timezone — so drop-in session dates/times render correctly regardless
  // of the player's own device timezone.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: regBranding } = await (db as any)
    .from('org_branding').select('timezone').eq('organization_id', org.id).maybeSingle()
  const orgTimezone: string = regBranding?.timezone ?? 'America/Toronto'

  // If the player already consented to the CURRENT Fieldday Privacy Policy version
  // in this org, don't make them re-consent (only required when the policy changes).
  let privacyAlreadyAccepted = false
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: privDoc } = await (db as any)
      .from('legal_documents').select('id').eq('slug', 'privacy-policy').maybeSingle()
    if (privDoc) {
      // Resolve the same version createRegistration records (latest published).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ver } = await (db as any)
        .from('legal_document_versions')
        .select('id')
        .eq('document_id', privDoc.id)
        .order('published_at', { ascending: false })
        .limit(1).maybeSingle()
      if (ver?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (db as any)
          .from('player_consents')
          .select('id')
          .eq('organization_id', org.id)
          .eq('user_id', user.id)
          .eq('consent_type', 'privacy_policy')
          .eq('consent_given', true)
          .eq('legal_document_version_id', ver.id)
          .is('withdrawn_at', null)
          .limit(1).maybeSingle()
        privacyAlreadyAccepted = !!existing
      }
    }
  }

  // captainTeam is shaped as { id, name, team_members: [{ role }] }
  // Extract before the resume logic so we can use team membership to avoid
  // redirecting per-team players to success before they've joined a team.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myTeamRow = captainTeam as any
  const myTeamId = myTeamRow?.id ?? null
  const myTeamName = myTeamRow?.name ?? null
  const myTeamMembers = myTeamRow?.team_members
  const myTeamMember = Array.isArray(myTeamMembers) ? myTeamMembers[0] : myTeamMembers
  const myTeamRole = myTeamMember?.role ?? null

  const captainTeamId = myTeamRole === 'captain' ? myTeamId : null
  const captainTeamName = myTeamRole === 'captain' ? myTeamName : null
  // Already on a team as a non-captain (e.g. accepted a team invite)
  const playerTeamId = myTeamRole && myTeamRole !== 'captain' ? myTeamId : null
  const playerTeamName = myTeamRole && myTeamRole !== 'captain' ? myTeamName : null

  // For per-team events: a player who hasn't joined a team yet must go through step 3
  // (team code entry) before we consider their registration complete. Without this guard
  // the resume logic would redirect them straight to /success after waiver signing.
  const perTeamPlayerNeedsTeam =
    isPerTeamLeague && captainTeamId === null && playerTeamId === null

  // Determine the right step to resume at if the player has an existing registration
  let initialStep = 1
  let initialRegistrationId: string | null = null

  if (existingReg) {
    initialRegistrationId = existingReg.id

    const waiverSigned = !!existingReg.waiver_signature_id

    // Check if they have a completed payment.
    // Query for any paid/manual record directly — avoids maybeSingle() issues when
    // multiple 'pending' Stripe sessions exist for the same registration.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: completedPayment } = await (db as any)
      .from('payments')
      .select('status')
      .eq('registration_id', existingReg.id)
      .in('status', ['paid', 'manual'])
      .limit(1)
      .maybeSingle()

    // 'paid' = Stripe payment confirmed; 'manual' = offline payment acknowledged in-flow
    const paymentComplete = !!completedPayment
    // An offline method selected at checkout reserves the spot immediately
    // (registration set active, payment left pending for the admin to reconcile).
    // Treat an active registration as settled so the player isn't re-prompted.
    const reserved = existingReg.status === 'active'
    const now = new Date()
    const earlyBirdActive = !isDropIn && earlyBirdPriceCents != null && earlyBirdDeadline != null && now < new Date(earlyBirdDeadline)
    const effectivePrice = isDropIn ? (dropInPriceCents ?? 0) : (earlyBirdActive ? earlyBirdPriceCents! : league.price_cents)
    const needsPayment = effectivePrice > 0 && hasOnlinePayments && !paymentComplete && !reserved
    // Manual payment: price set but no Stripe — player must see payment instructions
    // before we activate them.
    const needsManualPayment = effectivePrice > 0 && !hasOnlinePayments && !paymentComplete && !reserved

    // Per-team captain: if registration is active but no payment record exists,
    // the captain was activated before payment was collected (old bug or fresh invite).
    // Route them back through the payment step regardless of registration status.
    const captainNeedsToPayViaFlow =
      isPerTeamLeague && captainTeamId !== null && effectivePrice > 0 && !paymentComplete

    if (existingReg.status === 'active' && !needsPayment && !captainNeedsToPayViaFlow && !perTeamPlayerNeedsTeam) {
      redirect(`/register/${slug}/success`)
    } else if ((existingReg.status === 'active' || waiverSigned) && !needsPayment && !captainNeedsToPayViaFlow && perTeamPlayerNeedsTeam) {
      // Per-team player: registration may be active/waiver signed but they haven't
      // joined a team yet — send them to the team code step.
      initialStep = 3
    } else if ((needsPayment || needsManualPayment || captainNeedsToPayViaFlow) && (waiverSigned || !waiver)) {
      initialStep = 3 // jump to payment (Stripe or manual instructions)
    } else if (waiver && !waiverSigned) {
      initialStep = 2 // jump to waiver
    } else if (!needsPayment && !needsManualPayment && waiverSigned) {
      // Truly free event: waiver signed, no payment of any kind needed — auto-activate
      await db.from('registrations').update({ status: 'active' }).eq('id', existingReg.id)
      redirect(`/register/${slug}/success`)
    } else if (!needsPayment && !needsManualPayment) {
      // No payment needed and no waiver signed yet (or no waiver required) —
      // resume at step 2 so the user explicitly confirms rather than being
      // silently activated if they navigated away mid-flow.
      initialStep = 2
    } else {
      initialStep = 3
    }
  }

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
      priorWaiverSignatureId={priorWaiverSignatureId}
      privacyAlreadyAccepted={privacyAlreadyAccepted}
      hasOnlinePayments={hasOnlinePayments}
      positions={positions}
      isDropIn={isDropIn}
      dropInPriceCents={dropInPriceCents}
      earlyBirdPriceCents={earlyBirdPriceCents}
      earlyBirdDeadline={earlyBirdDeadline}
      captainTeamId={captainTeamId}
      captainTeamName={captainTeamName}
      playerTeamId={playerTeamId}
      playerTeamName={playerTeamName}
      teamsAtCapacity={teamsAtCapacity}
      leagueTeams={leagueTeams}
      leagueMerch={leagueMerch}
      initialTeamCode={initialTeamCode}
      manualPaymentInstructions={manualPaymentInstructions}
      acceptedMethods={acceptedMethods}
      offlineInstructions={offlineInstructions}
      dropInSessions={dropInSessions}
      timezone={orgTimezone}
      preselectedSessionId={preselectedSessionId}
      paymentPlan={paymentPlan}
    />
  )
}
