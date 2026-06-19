'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { sendRegistrationConfirmation, sendRegistrationAdminNotification, type RegistrationPaymentMethod } from './emails'
import { acceptDropInInvite, acceptPickupInvite } from './invites'
import { recordConsents, consentRequestMeta, type ConsentRow } from './player-consents'
import { recordAuditLog, getAuditActor } from '@/lib/audit'
import { calendarSubscribeUrls, ensureCalendarToken } from '@/lib/calendar-feed'
import { buildCalendarCtaHtml } from '@/lib/email'
import { isPlayerRegistrationBlocked } from '@/lib/billing'
import { toE164 } from '@/lib/twilio'
import { createRateLimiter } from '@/lib/rate-limit'

// Public guest endpoints are unauthenticated writes — rate-limit by IP.
const guestRegLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 8 })

const createRegistrationSchema = z.object({
  leagueId: z.string().uuid(),
  waiverSignatureId: z.string().uuid().optional(),
  formData: z.record(z.string(), z.unknown()).optional(),
  position: z.string().optional(),
  registration_type: z.enum(['season', 'drop_in']).default('season'),
  session_id: z.string().uuid().optional().nullable(),
  // ── Consent capture (PIPEDA + CASL) — all optional for backward compatibility
  consent: z.object({
    privacyAccepted: z.boolean().optional(),   // required consents checkbox ticked
    marketingEmail: z.boolean().optional(),    // opt-in, default false
    marketingSms: z.boolean().optional(),      // opt-in, default false
    waiverId: z.string().uuid().optional(),    // the waiver consented to (if any)
  }).optional(),
})

export async function createRegistration(input: z.infer<typeof createRegistrationSchema>) {
  const parsed = createRegistrationSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const db = createServiceRoleClient()

  // ── Plan enforcement: player cap check ──────────────────────────────────
  if (await isPlayerRegistrationBlocked(org.id)) {
    return { data: null, error: 'PLAYER_CAP_REACHED' }
  }

  // ── League status + capacity check ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leagueCap } = await (db as any)
    .from('leagues')
    .select('status, payment_mode, max_participants')
    .eq('id', parsed.data.leagueId)
    .eq('organization_id', org.id)
    .single()

  // Registrations are only allowed for open or active events.
  if (!leagueCap || leagueCap.status === 'draft' || leagueCap.status === 'completed' || leagueCap.status === 'archived') {
    return { data: null, error: 'Registration is not open for this event' }
  }

  if (leagueCap?.payment_mode !== 'per_team' && leagueCap?.max_participants) {
    const { count } = await db
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', parsed.data.leagueId)
      .eq('organization_id', org.id)
      .in('status', ['pending', 'active'])
    if ((count ?? 0) >= leagueCap.max_participants) {
      return { data: null, error: 'EVENT_FULL' }
    }
  }

  // Check for existing registration (skip dedup for drop-in — each invite creates a fresh reg)
  if (parsed.data.registration_type === 'season') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from('registrations')
      .select('id, status')
      .eq('organization_id', org.id)
      .eq('league_id', parsed.data.leagueId)
      .eq('user_id', user.id)
      .eq('registration_type', 'season')
      .single()

    if (existing) return { data: { registrationId: existing.id }, error: null }
  }

  // Ensure org membership
  await db.from('org_members').upsert({
    organization_id: org.id,
    user_id: user.id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

  const isDropIn = parsed.data.registration_type === 'drop_in'
  const expiresAt = isDropIn
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { data, error } = await db
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
      session_id: parsed.data.session_id ?? null,
    } as never)
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  // ── Consent capture (append-only ledger) ──────────────────────────────────
  // Additive: the waiver itself is still recorded in waiver_signatures (above
  // via waiverSignatureId). Here we also log the consent ledger rows.
  if (parsed.data.consent) {
    const c = parsed.data.consent
    const meta = await consentRequestMeta()
    const rows: ConsentRow[] = []

    // Privacy policy (required) — link to the current published 'privacy' version
    if (c.privacyAccepted) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: privDoc } = await (db as any)
        .from('legal_documents').select('id, slug').eq('slug', 'privacy-policy').maybeSingle()
      let legalVersionId: string | null = null
      let versionLabel: string | null = null
      if (privDoc) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ver } = await (db as any)
          .from('legal_document_versions')
          .select('id, version')
          .eq('document_id', privDoc.id)
          .order('published_at', { ascending: false })
          .limit(1).maybeSingle()
        legalVersionId = ver?.id ?? null
        versionLabel = ver?.version ?? null
      }
      // Don't append a duplicate if they already consented to this exact version
      // (existing players only re-consent when the policy changes).
      let alreadyOnFile = false
      if (legalVersionId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingConsent } = await (db as any)
          .from('player_consents')
          .select('id')
          .eq('organization_id', org.id)
          .eq('user_id', user.id)
          .eq('consent_type', 'privacy_policy')
          .eq('consent_given', true)
          .eq('legal_document_version_id', legalVersionId)
          .is('withdrawn_at', null)
          .limit(1).maybeSingle()
        alreadyOnFile = !!existingConsent
      }
      if (!alreadyOnFile) {
        rows.push({
          organization_id: org.id, user_id: user.id, league_id: parsed.data.leagueId,
          consent_type: 'privacy_policy', consent_given: true,
          document_slug: 'privacy-policy', document_version: versionLabel,
          legal_document_version_id: legalVersionId,
          ip_address: meta.ip, user_agent: meta.userAgent,
        })
      }
    }

    // (Waiver consent is logged by signWaiver, where the signature is created —
    //  it happens in a later step after the registration already exists.)

    // Marketing email — opt-in, recorded either way (opt-out is a real record)
    rows.push({
      organization_id: org.id, user_id: user.id, league_id: parsed.data.leagueId,
      consent_type: 'marketing_email', consent_given: !!c.marketingEmail,
      ip_address: meta.ip, user_agent: meta.userAgent,
    })
    // Marketing SMS — only when the player provided a phone (flag implies it)
    if (c.marketingSms !== undefined) {
      rows.push({
        organization_id: org.id, user_id: user.id, league_id: parsed.data.leagueId,
        consent_type: 'marketing_sms', consent_given: !!c.marketingSms,
        ip_address: meta.ip, user_agent: meta.userAgent,
      })
    }

    const consentRes = await recordConsents(rows)
    if (consentRes.error) {
      console.error('[createRegistration] consent capture failed:', consentRes.error)
    }
  }

  // Mark the invite as accepted
  if (user.email) {
    if (isDropIn) {
      await acceptDropInInvite(parsed.data.leagueId, user.email)
    } else {
      await acceptPickupInvite(parsed.data.leagueId, user.email)
    }
  }

  return { data: { registrationId: data.id }, error: null }
}

export async function removeRegistration(registrationId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const { createServiceRoleClient } = await import('@/lib/supabase/service')
  const db = createServiceRoleClient()

  // Fetch the registration to get the user_id before deleting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg, error: fetchError } = await (db as any)
    .from('registrations')
    .select('user_id, profiles:profiles!registrations_user_id_fkey(full_name, email)')
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

  // Nullify registration_id on any payments before deleting — the payments FK
  // has no ON DELETE clause (defaults to RESTRICT), which would block deletion.
  // Payments are kept for financial records; we just detach them from the registration.
  await db
    .from('payments')
    .update({ registration_id: null })
    .eq('registration_id', registrationId)

  const { error } = await db
    .from('registrations')
    .delete()
    .eq('id', registrationId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prof: any = Array.isArray((reg as any).profiles) ? (reg as any).profiles[0] : (reg as any).profiles
  const actor = await getAuditActor()
  await recordAuditLog({
    orgId: org.id,
    actorUserId: actor.actorUserId,
    actorLabel: actor.actorLabel,
    action: 'registration.removed',
    targetType: 'registration',
    targetId: registrationId,
    targetLabel: prof?.full_name ?? prof?.email ?? null,
    metadata: { league_id: leagueId, user_id: (reg as { user_id: string }).user_id },
  })

  revalidatePath(`/admin/events/${leagueId}/registrations`)
  revalidatePath(`/admin/events/${leagueId}/teams`)
  return { error: null }
}

export async function activateRegistration(registrationId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const db2 = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg, error: fetchError } = await (db2 as any)
    .from('registrations')
    .select('*, checkin_token, profiles!registrations_user_id_fkey(full_name, email), leagues!registrations_league_id_fkey(id, name, slug, sport, event_type, checkin_enabled, calendar_token, price_cents, payment_mode, season_start_date, game_start_time, game_end_time, days_of_week, venue_name, venue_address, venue_maps_url)')
    .eq('id', registrationId)
    .eq('organization_id', org.id)
    .single()

  if (fetchError || !reg) return { data: null, error: 'Registration not found' }

  const { error } = await db2
    .from('registrations')
    .update({ status: 'active' } as never)
    .eq('id', registrationId)

  if (error) return { data: null, error: error.message }

  const profile = Array.isArray(reg.profiles) ? reg.profiles[0] : reg.profiles
  const league = Array.isArray(reg.leagues) ? reg.leagues[0] : reg.leagues

  if (profile?.email && league?.name) {
    const origin = headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
    const checkinUrl = (reg.checkin_token && league?.checkin_enabled === true)
      ? `${origin}/checkin/${reg.checkin_token}`
      : null

    // Calendar CTA for pickup/drop-in only — for league/tournament events the
    // player hasn't joined a team yet, so the team calendar link (sent in the
    // team-added / join-approved email) is more useful and timely.
    let calendarCtaHtml: string | undefined
    if (['pickup', 'drop_in'].includes(league.event_type ?? '') && league.slug) {
      const host = headersList.get('host') ?? ''
      const token = await ensureCalendarToken(db2, 'leagues', league.id, league.calendar_token)
      if (host && token) {
        const { webcalUrl, googleUrl } = calendarSubscribeUrls(host, `/api/events/${league.slug}/calendar.ics?token=${token}`)
        calendarCtaHtml = buildCalendarCtaHtml({
          webcalUrl, googleUrl,
          subtext: 'Stay in sync automatically as sessions are added, moved, or cancelled.',
        })
      }
    }

    await sendRegistrationConfirmation({
      email: profile.email,
      name: profile.full_name,
      leagueName: league.name,
      orgName: org.name,
      sport: league.sport ?? null,
      eventType: league.event_type ?? null,
      checkinUrl,
      calendarCtaHtml,
      seasonStartDate: (league as { season_start_date?: string | null }).season_start_date ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gameStartTime: (league as any).game_start_time ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gameEndTime: (league as any).game_end_time ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      daysOfWeek: (league as any).days_of_week ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      venueName: (league as any).venue_name ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      venueAddress: (league as any).venue_address ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      venueMapsUrl: (league as any).venue_maps_url ?? null,
    })
  }

  // ── Admin registration notification ───────────────────────────────────────
  // For FREE leagues: notify now (payment is complete — it's free).
  // For PAID leagues: skip here. The payment handler (Stripe webhook or
  // selectOfflinePayment) sends the notification with the actual payment method
  // once the player has chosen how they'll pay.
  // Fire-and-forget — never block the player's registration flow on this.
  const leaguePriceCents: number = league?.price_cents ?? 0
  const isFreeLeague = leaguePriceCents === 0
  if (isFreeLeague) {
    try {
      const service = createServiceRoleClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: notifSettings } = await (service as any)
        .from('org_notification_settings')
        .select('registration_notifications_enabled, registration_notification_email')
        .eq('organization_id', org.id)
        .single()

      if (notifSettings?.registration_notifications_enabled) {
        let recipients: string[]
        if (notifSettings.registration_notification_email) {
          recipients = [notifSettings.registration_notification_email]
        } else {
          const { data: admins } = await service
            .from('org_members')
            .select('profile:profiles!org_members_user_id_fkey(email)')
            .eq('organization_id', org.id)
            .eq('role', 'org_admin')
            .eq('status', 'active')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recipients = (admins ?? []).flatMap((a: any) => {
            const email = Array.isArray(a.profile) ? a.profile[0]?.email : a.profile?.email
            return email ? [email as string] : []
          })
        }
        if (recipients.length > 0) {
          const origin = headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
          await sendRegistrationAdminNotification({
            to: recipients,
            playerName: profile?.full_name ?? null,
            playerEmail: profile?.email ?? null,
            leagueName: league?.name ?? 'an event',
            orgName: org.name,
            adminUrl: `${origin}/admin/players`,
            paymentMethod: 'free',
          })
        }
      }
    } catch (err) {
      console.error('[confirmRegistration] admin notification failed:', err)
    }
  }

  revalidatePath('/dashboard')
  return { data: null, error: null }
}

// ── Admin: manually add a registrant ─────────────────────────────────────────

const adminAddRegistrantSchema = z.object({
  leagueId: z.string().uuid(),
  fullName: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  amountCents: z.number().int().min(0),
  method: z.enum(['cash', 'etransfer', 'cheque', 'stripe', 'card', 'other']),
  notes: z.string().optional(),
})

/**
 * Org-admin manual registration for someone who won't use the app. If an email
 * is given we link/create a real account (claimable later); otherwise we create
 * a guest registration (user_id NULL, name stored inline). Optionally records the
 * payment they handed over. No waiver step.
 */
export async function adminAddRegistrant(input: z.infer<typeof adminAddRegistrantSchema>) {
  const parsed = adminAddRegistrantSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  const { data: caller } = await db
    .from('org_members').select('role')
    .eq('organization_id', org.id).eq('user_id', user.id).single()
  if (!caller || !['org_admin', 'league_admin'].includes(caller.role)) return { error: 'Unauthorized' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('id, name').eq('id', parsed.data.leagueId).eq('organization_id', org.id).maybeSingle()
  if (!league) return { error: 'Event not found' }

  const email = parsed.data.email?.trim() || ''
  const phone = parsed.data.phone?.trim() || ''
  let registrantUserId: string | null = null

  if (email) {
    // Link an existing account, or create a confirmed one with no password.
    const { data: existingProfile } = await db
      .from('profiles').select('id').eq('email', email).maybeSingle()

    if (existingProfile) {
      registrantUserId = existingProfile.id
    } else {
      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.fullName },
      })
      if (createErr || !created?.user) return { error: createErr?.message ?? 'Could not create the account' }
      registrantUserId = created.user.id
      await db.from('profiles').update({
        full_name: parsed.data.fullName,
        phone: phone ? toE164(phone) : null,
      }).eq('id', registrantUserId)
    }

    await db.from('org_members').upsert({
      organization_id: org.id,
      user_id: registrantUserId,
      role: 'player',
      status: 'active',
      invited_email: email,
    }, { onConflict: 'organization_id,user_id', ignoreDuplicates: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dupe } = await (db as any)
      .from('registrations').select('id')
      .eq('league_id', parsed.data.leagueId).eq('user_id', registrantUserId).maybeSingle()
    if (dupe) return { error: 'This person is already registered for this event.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg, error: regErr } = await (db as any)
    .from('registrations')
    .insert({
      organization_id: org.id,
      league_id: parsed.data.leagueId,
      user_id: registrantUserId,
      guest_name: registrantUserId ? null : parsed.data.fullName,
      guest_email: registrantUserId ? null : (email || null),
      guest_phone: registrantUserId ? null : (phone || null),
      added_by_admin: user.id,
      registration_type: 'season',
      status: 'active',
    })
    .select('id')
    .single()
  if (regErr || !reg) return { error: regErr?.message ?? 'Could not create the registration' }

  if (parsed.data.amountCents > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: payErr } = await (db as any).from('payments').insert({
      organization_id: org.id,
      registration_id: reg.id,
      user_id: registrantUserId,
      league_id: parsed.data.leagueId,
      payment_type: 'player',
      amount_cents: parsed.data.amountCents,
      currency: 'cad',
      status: 'paid',
      payment_method: parsed.data.method,
      notes: parsed.data.notes?.trim() || null,
      paid_at: new Date().toISOString(),
    })
    if (payErr) return { error: payErr.message }
  }

  const actor = await getAuditActor()
  await recordAuditLog({
    orgId: org.id,
    actorUserId: actor.actorUserId,
    actorLabel: actor.actorLabel,
    action: 'registration.manual_added',
    targetType: 'registration',
    targetId: reg.id,
    metadata: {
      league_id: parsed.data.leagueId,
      guest: !registrantUserId,
      amount_cents: parsed.data.amountCents,
    },
  })

  revalidatePath('/admin/payments')
  revalidatePath(`/admin/events/${parsed.data.leagueId}/registrations`)
  return { error: null, registrationId: reg.id, guest: !registrantUserId }
}

// ── Guest (no-account) self-serve drop-in registration ───────────────────────

// Mirrors the register page's gate. Guests may self-register for drop-in/pickup
// events, except invite-only ('private') events which require an individual
// invite (and therefore an account). 'public' and group-'link' events allow it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isOpenDropInEvent(league: any): boolean {
  const isPickup = league?.league_type === 'dropin'
    || league?.event_type === 'drop_in'
    || league?.event_type === 'pickup'
  return isPickup && (league?.pickup_join_policy ?? 'public') !== 'private'
}

const guestDropinSchema = z.object({
  leagueId: z.string().uuid(),
  sessionId: z.string().uuid().optional().nullable(),
  fullName: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  waiverSignatureId: z.string().uuid().optional().nullable(),
  // Required for invite-only ('private') events — authorizes the invited guest.
  inviteToken: z.string().min(1).optional().nullable(),
})

/**
 * Public, unauthenticated drop-in registration for a guest (no account). Creates
 * a `registrations` row with `user_id` NULL and the guest's contact details inline.
 *
 * - Free or pay-at-the-door (manual) events → status 'active' immediately.
 * - Online-paid events (Stripe connected) → status 'pending'; the caller then runs
 *   the guest checkout and the webhook/return-fallback flips it to 'active' + paid.
 *
 * The waiver is signed separately via `signWaiverAsGuest` and linked here.
 */
export async function registerGuestDropin(input: z.infer<typeof guestDropinSchema>) {
  const parsed = guestDropinSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', registrationId: null, needsPayment: false, slug: null }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() ?? headersList.get('x-real-ip') ?? 'unknown'
  if (guestRegLimiter.check(ip).limited) {
    return { error: 'Too many requests. Please wait a few minutes and try again.', registrationId: null, needsPayment: false, slug: null }
  }

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('id, name, slug, status, event_type, league_type, pickup_join_policy, drop_in_price_cents, price_cents, currency')
    .eq('id', parsed.data.leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!league) return { error: 'Event not found', registrationId: null, needsPayment: false, slug: null }
  if (!['registration_open', 'active'].includes(league.status)) {
    return { error: 'Registration is not open for this event.', registrationId: null, needsPayment: false, slug: null }
  }

  // Invite-only events require a valid drop-in invite token; the invited email is
  // taken from the invite (so it can't be spoofed). Other policies use the open gate.
  const policy: string = league.pickup_join_policy ?? 'public'
  let acceptedInviteId: string | null = null
  let invitedEmail: string | null = null
  if (policy === 'private') {
    if (!parsed.data.inviteToken) {
      return { error: 'This event is invite only.', registrationId: null, needsPayment: false, slug: null }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inviteRow } = await (db as any)
      .from('pickup_invites')
      .select('id, email')
      .eq('organization_id', org.id)
      .eq('league_id', league.id)
      .eq('token', parsed.data.inviteToken)
      .eq('invite_type', 'drop_in')
      .eq('status', 'pending')
      .maybeSingle()
    if (!inviteRow?.email) {
      return { error: 'This invite link is no longer valid.', registrationId: null, needsPayment: false, slug: null }
    }
    acceptedInviteId = inviteRow.id
    invitedEmail = inviteRow.email
  } else if (!isOpenDropInEvent(league)) {
    return { error: 'Guest registration is not available for this event.', registrationId: null, needsPayment: false, slug: null }
  }

  const priceCents: number = league.drop_in_price_cents ?? league.price_cents ?? 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (db as any)
    .from('org_payment_settings')
    .select('stripe_secret_key, registration_payment_mode')
    .eq('organization_id', org.id)
    .maybeSingle()
  const onlinePayments = !!settings?.stripe_secret_key && (settings?.registration_payment_mode ?? 'stripe') !== 'manual'
  const needsOnlinePayment = priceCents > 0 && onlinePayments

  // For invite-only events, always use the invited email (don't trust the client).
  const email = (invitedEmail ?? parsed.data.email).toLowerCase()
  const phone = parsed.data.phone?.trim() || null

  // If this email already has an account, fold the registration into it so the
  // person's history stays unified (and they can see it under My Events).
  const { data: existingProfile } = await db
    .from('profiles').select('id').ilike('email', email).maybeSingle()
  const registrantUserId: string | null = existingProfile?.id ?? null

  if (registrantUserId) {
    // Avoid a duplicate drop-in row for the same session.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dupeQuery = (db as any)
      .from('registrations').select('id, status')
      .eq('league_id', league.id).eq('organization_id', org.id).eq('user_id', registrantUserId)
      .eq('registration_type', 'drop_in')
    if (parsed.data.sessionId) dupeQuery.eq('session_id', parsed.data.sessionId)
    const { data: dupe } = await dupeQuery.maybeSingle()
    if (dupe) {
      return { error: 'You already have an account with this email and are registered for this session. Please sign in to view it.', registrationId: null, needsPayment: false, slug: null }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg, error: regErr } = await (db as any)
    .from('registrations')
    .insert({
      organization_id: org.id,
      league_id: league.id,
      user_id: registrantUserId,
      guest_name: registrantUserId ? null : parsed.data.fullName,
      guest_email: registrantUserId ? null : email,
      guest_phone: registrantUserId ? null : phone,
      registration_type: 'drop_in',
      session_id: parsed.data.sessionId || null,
      waiver_signature_id: parsed.data.waiverSignatureId || null,
      status: needsOnlinePayment ? 'pending' : 'active',
    })
    .select('id')
    .single()
  if (regErr || !reg) return { error: regErr?.message ?? 'Could not create the registration', registrationId: null, needsPayment: false, slug: null }

  // Pay-at-the-venue (no online payment available, but there's a fee): record a
  // pending payment so the organizer can see the amount owed and reconcile it.
  if (!needsOnlinePayment && priceCents > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('payments').insert({
      organization_id: org.id,
      registration_id: reg.id,
      user_id: registrantUserId,
      league_id: league.id,
      payment_type: 'player',
      amount_cents: priceCents,
      currency: league.currency ?? 'cad',
      status: 'pending',
      payment_method: 'cash',
    })
  }

  // Consume the invite once the spot is secured (immediate-active registrations).
  // For online-paid events the registration is still 'pending', so leave the invite
  // usable until payment completes rather than burning it on an abandoned checkout.
  if (acceptedInviteId && !needsOnlinePayment) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('pickup_invites').update({ status: 'accepted' }).eq('id', acceptedInviteId)
  }

  return { error: null, registrationId: reg.id as string, needsPayment: needsOnlinePayment, slug: league.slug as string, priceCents }
}

// ── Claim a guest registration into a real account ───────────────────────────

const claimGuestSchema = z.object({
  registrationId: z.string().uuid(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
})

/**
 * Upgrades a guest registration to a real account. Creates a confirmed Supabase
 * auth user from the guest's email + chosen password, moves the registration and
 * any guest waiver signatures onto the new user, and adds org membership. The
 * caller signs the user in client-side afterwards.
 */
export async function claimGuestRegistration(input: z.infer<typeof claimGuestSchema>) {
  const parsed = claimGuestSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', email: null }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() ?? headersList.get('x-real-ip') ?? 'unknown'
  if (guestRegLimiter.check(ip).limited) return { error: 'Too many requests. Please wait a few minutes and try again.', email: null }

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg } = await (db as any)
    .from('registrations')
    .select('id, user_id, guest_name, guest_email, guest_phone')
    .eq('id', parsed.data.registrationId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!reg) return { error: 'Registration not found', email: null }
  if (reg.user_id) return { error: 'This registration already belongs to an account. Please sign in.', email: null }
  const email = (reg.guest_email as string | null)?.toLowerCase()
  if (!email) return { error: 'This registration has no email to create an account with.', email: null }

  // If an account somehow already exists for this email, don't clobber it.
  const { data: existing } = await db.from('profiles').select('id').ilike('email', email).maybeSingle()
  if (existing) return { error: 'An account already exists for this email. Please sign in instead.', email }

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: reg.guest_name ?? '' },
  })
  if (createErr || !created?.user) return { error: createErr?.message ?? 'Could not create the account', email }
  const newUserId = created.user.id

  await db.from('profiles').update({
    full_name: reg.guest_name ?? null,
    phone: reg.guest_phone ? toE164(reg.guest_phone) : null,
  }).eq('id', newUserId)

  await db.from('org_members').upsert({
    organization_id: org.id,
    user_id: newUserId,
    role: 'player',
    status: 'active',
    invited_email: email,
  }, { onConflict: 'organization_id,user_id', ignoreDuplicates: false })

  // Move the registration onto the account and clear the inline guest fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('registrations').update({
    user_id: newUserId,
    guest_name: null,
    guest_email: null,
    guest_phone: null,
  }).eq('id', reg.id).eq('organization_id', org.id)

  // Re-home any guest waiver signatures for this email so they appear in account history.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('waiver_signatures').update({ user_id: newUserId, guest_name: null, guest_email: null })
    .eq('organization_id', org.id).is('user_id', null).ilike('guest_email', email)

  // Attach any other paid guest payments for this registration to the account.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('payments').update({ user_id: newUserId })
    .eq('organization_id', org.id).eq('registration_id', reg.id).is('user_id', null)

  return { error: null, email }
}
