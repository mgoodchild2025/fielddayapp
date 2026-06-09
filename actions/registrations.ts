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
      rows.push({
        organization_id: org.id, user_id: user.id, league_id: parsed.data.leagueId,
        consent_type: 'privacy_policy', consent_given: true,
        document_slug: 'privacy-policy', document_version: versionLabel,
        legal_document_version_id: legalVersionId,
        ip_address: meta.ip, user_agent: meta.userAgent,
      })
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
