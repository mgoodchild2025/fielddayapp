'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { resolveLeagueMethods, isOfflineMethod, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/payment-methods'
import { sendRegistrationAdminNotification, type RegistrationPaymentMethod } from './emails'
import { recordAuditLog, AUDIT_ACTIONS, getAuditActor } from '@/lib/audit'

const recordManualPaymentSchema = z.object({
  registrationId: z.string().uuid(),
  userId: z.string().uuid(),
  leagueId: z.string().uuid(),
  amountCents: z.number().min(0),
  currency: z.string().default('cad'),
  method: z.enum(['cash', 'etransfer', 'cheque']),
  notes: z.string().optional(),
})

export async function recordManualPayment(input: z.infer<typeof recordManualPaymentSchema>) {
  const parsed = recordManualPaymentSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const db = createServiceRoleClient()

  const paidFields = {
    amount_cents: parsed.data.amountCents,
    currency: parsed.data.currency,
    status: 'paid' as const,
    payment_method: parsed.data.method,
    notes: parsed.data.notes ?? null,
    paid_at: new Date().toISOString(),
  }

  // ── Per-team payment mode ──────────────────────────────────────────────────
  // When the league uses per_team payments the payment row is keyed by team_id
  // (not registration_id). selectOfflineTeamPayment creates a row with
  // payment_type = 'team' and team_id set, but registration_id = NULL.
  // The standard lookup below would miss it, so we handle it first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leagueRow } = await (db as any)
    .from('leagues')
    .select('payment_mode')
    .eq('id', parsed.data.leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (leagueRow?.payment_mode === 'per_team') {
    // Resolve which team this user belongs to in this league
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leagueTeams } = await (db as any)
      .from('teams')
      .select('id')
      .eq('league_id', parsed.data.leagueId)
      .eq('organization_id', org.id)
    const leagueTeamIds: string[] = (leagueTeams ?? []).map((t: { id: string }) => t.id)

    let teamId: string | null = null
    if (leagueTeamIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: teamMember } = await (db as any)
        .from('team_members')
        .select('team_id')
        .eq('user_id', parsed.data.userId)
        .in('team_id', leagueTeamIds)
        .eq('status', 'active')
        .maybeSingle()
      teamId = teamMember?.team_id ?? null
    }

    if (teamId) {
      // Find the pending team payment row created by selectOfflineTeamPayment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingTeamPayment } = await (db as any)
        .from('payments')
        .select('id')
        .eq('team_id', teamId)
        .eq('league_id', parsed.data.leagueId)
        .eq('organization_id', org.id)
        .eq('payment_type', 'team')
        .neq('status', 'paid')
        .maybeSingle()

      if (existingTeamPayment) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (db as any)
          .from('payments')
          .update(paidFields)
          .eq('id', existingTeamPayment.id)
        if (error) return { data: null, error: error.message }
      } else {
        // No pending team payment row exists yet — admin is recording a manual
        // cash payment without a prior selectOfflineTeamPayment call; create one.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (db as any).from('payments').insert({
          organization_id: org.id,
          team_id: teamId,
          league_id: parsed.data.leagueId,
          payment_type: 'team',
          ...paidFields,
        })
        if (error) return { data: null, error: error.message }
      }

      // Activate all active team members' registrations in case any are still pending
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: members } = await (db as any)
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .eq('status', 'active')
      const memberUserIds: string[] = (members ?? [])
        .map((m: { user_id: string }) => m.user_id)
        .filter(Boolean)
      if (memberUserIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('registrations')
          .update({ status: 'active' })
          .eq('league_id', parsed.data.leagueId)
          .eq('organization_id', org.id)
          .in('user_id', memberUserIds)
          .in('status', ['pending', 'waitlisted'])
      }

      const actor = await getAuditActor()
      await recordAuditLog({
        orgId: org.id,
        actorUserId: actor.actorUserId,
        actorLabel: actor.actorLabel,
        action: AUDIT_ACTIONS.PAYMENT_MANUAL_RECORDED,
        targetType: 'registration',
        targetId: parsed.data.registrationId,
        metadata: {
          user_id: parsed.data.userId,
          league_id: parsed.data.leagueId,
          team_id: teamId,
          amount_cents: parsed.data.amountCents,
          currency: parsed.data.currency,
          method: parsed.data.method,
          payment_mode: 'per_team',
        },
      })

      revalidatePath('/admin/payments')
      return { data: null, error: null }
    }
  }
  // ── End per-team handling ──────────────────────────────────────────────────

  // Reconcile an existing pending payment (e.g. an offline method the player
  // chose at checkout) instead of inserting a duplicate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (db as any)
    .from('payments')
    .select('id')
    .eq('registration_id', parsed.data.registrationId)
    .eq('organization_id', org.id)
    .neq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from('payments').update(paidFields).eq('id', existing.id)
    if (error) return { data: null, error: error.message }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from('payments').insert({
      organization_id: org.id,
      registration_id: parsed.data.registrationId,
      user_id: parsed.data.userId,
      league_id: parsed.data.leagueId,
      ...paidFields,
    })
    if (error) return { data: null, error: error.message }
  }

  // Activate the registration
  await db.from('registrations').update({ status: 'active' }).eq('id', parsed.data.registrationId)

  const actor = await getAuditActor()
  await recordAuditLog({
    orgId: org.id,
    actorUserId: actor.actorUserId,
    actorLabel: actor.actorLabel,
    action: AUDIT_ACTIONS.PAYMENT_MANUAL_RECORDED,
    targetType: 'registration',
    targetId: parsed.data.registrationId,
    metadata: {
      user_id: parsed.data.userId,
      league_id: parsed.data.leagueId,
      amount_cents: parsed.data.amountCents,
      currency: parsed.data.currency,
      method: parsed.data.method,
    },
  })

  revalidatePath('/admin/payments')
  return { data: null, error: null }
}

const selectOfflinePaymentSchema = z.object({
  registrationId: z.string().uuid(),
  leagueId: z.string().uuid(),
  method: z.enum(['etransfer', 'cash', 'cheque']),
  /** Discounted amount in cents. When provided, used instead of league.price_cents. */
  discountedAmountCents: z.number().int().nonnegative().optional(),
})

/**
 * Player picks an offline payment method at checkout. We reserve the spot
 * immediately (activate the registration) and record a PENDING payment for the
 * admin to reconcile. Returns the instructions to show the player.
 */
export async function selectOfflinePayment(
  input: z.infer<typeof selectOfflinePaymentSchema>
): Promise<{ instructions: string | null; methodLabel: string; error: string | null }> {
  const parsed = selectOfflinePaymentSchema.safeParse(input)
  if (!parsed.success) return { instructions: null, methodLabel: '', error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { instructions: null, methodLabel: '', error: 'Not authenticated' }

  const db = createServiceRoleClient()

  const [{ data: reg }, { data: league }, { data: orgPay }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('registrations')
      .select('id, user_id, organization_id, league_id, status')
      .eq('id', parsed.data.registrationId).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues')
      .select('id, price_cents, currency, payment_methods, payment_instructions')
      .eq('id', parsed.data.leagueId).eq('organization_id', org.id).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_payment_settings')
      .select('stripe_secret_key, registration_payment_mode, registration_manual_instructions')
      .eq('organization_id', org.id).maybeSingle(),
  ])

  if (!reg || reg.user_id !== user.id || reg.organization_id !== org.id) {
    return { instructions: null, methodLabel: '', error: 'Registration not found' }
  }
  if (!league) return { instructions: null, methodLabel: '', error: 'Event not found' }

  const method = parsed.data.method as PaymentMethod
  const allowed = resolveLeagueMethods(league.payment_methods, orgPay)
  if (!allowed.includes(method) || !isOfflineMethod(method)) {
    return { instructions: null, methodLabel: '', error: 'That payment method is not accepted for this event.' }
  }

  // Use the discounted amount when the player applied a discount code;
  // fall back to the league price so free registrations still work.
  const amountCents = parsed.data.discountedAmountCents ?? league.price_cents ?? 0
  const currency = league.currency ?? 'cad'

  // Record a pending payment (skip when free) — reuse any existing row.
  if (amountCents > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from('payments')
      .select('id, status')
      .eq('registration_id', reg.id)
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('payments').insert({
        organization_id: org.id,
        registration_id: reg.id,
        user_id: user.id,
        league_id: league.id,
        amount_cents: amountCents,
        currency,
        status: 'pending',
        payment_method: method,
      })
    } else if (existing.status !== 'paid') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('payments')
        .update({ payment_method: method, amount_cents: amountCents, currency, status: 'pending' })
        .eq('id', existing.id)
    }
  }

  // NOTE: we intentionally do NOT activate the registration here. The flow's
  // "Done" button activates it (activateRegistration) and routes to /success.
  // Activating here would trigger the register page's active-registration
  // redirect on the Server Action refresh, flashing past the instructions.

  const instructions =
    (league.payment_instructions?.trim() || null) ??
    (orgPay?.registration_manual_instructions ?? null)

  // Notify admins so they know to follow up and collect payment (fire-and-forget)
  notifyRegistrationAdmin(db, org.id, reg.user_id, league.id, league.name, method as RegistrationPaymentMethod).catch(() => {})

  revalidatePath('/admin/payments')
  return { instructions, methodLabel: PAYMENT_METHOD_LABELS[method], error: null }
}

const selectOfflineTeamPaymentSchema = z.object({
  teamId: z.string().uuid(),
  leagueId: z.string().uuid(),
  method: z.enum(['etransfer', 'cash', 'cheque']),
  /** Discounted amount in cents. When provided, used instead of league.price_cents. */
  discountedAmountCents: z.number().int().nonnegative().optional(),
})

/**
 * Per-team captain/coach picks an offline payment method for the team fee.
 * Mirrors the team Stripe webhook: records a PENDING team payment and activates
 * all active team members' registrations (reserve the team's spot immediately).
 */
export async function selectOfflineTeamPayment(
  input: z.infer<typeof selectOfflineTeamPaymentSchema>
): Promise<{ instructions: string | null; methodLabel: string; error: string | null }> {
  const parsed = selectOfflineTeamPaymentSchema.safeParse(input)
  if (!parsed.success) return { instructions: null, methodLabel: '', error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { instructions: null, methodLabel: '', error: 'Not authenticated' }

  const db = createServiceRoleClient()

  const [{ data: team }, { data: league }, { data: orgPay }, { data: membership }, { data: orgMember }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('teams').select('id, organization_id, league_id').eq('id', parsed.data.teamId).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, price_cents, currency, payment_methods, payment_instructions')
      .eq('id', parsed.data.leagueId).eq('organization_id', org.id).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_payment_settings')
      .select('stripe_secret_key, registration_payment_mode, registration_manual_instructions')
      .eq('organization_id', org.id).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('team_members').select('role')
      .eq('team_id', parsed.data.teamId).eq('user_id', user.id).eq('status', 'active').maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).maybeSingle(),
  ])

  if (!team || team.organization_id !== org.id || !league) {
    return { instructions: null, methodLabel: '', error: 'Team not found' }
  }

  const isManager = membership?.role === 'captain' || membership?.role === 'coach'
  const isAdmin = orgMember?.role === 'org_admin' || orgMember?.role === 'league_admin'
  if (!isManager && !isAdmin) {
    return { instructions: null, methodLabel: '', error: 'Only the team captain or coach can pay for the team.' }
  }

  const method = parsed.data.method as PaymentMethod
  const allowed = resolveLeagueMethods(league.payment_methods, orgPay)
  if (!allowed.includes(method) || !isOfflineMethod(method)) {
    return { instructions: null, methodLabel: '', error: 'That payment method is not accepted for this event.' }
  }

  const amountCents = parsed.data.discountedAmountCents ?? league.price_cents ?? 0
  const currency = league.currency ?? 'cad'

  // Pending team payment (reuse existing team payment row if present).
  if (amountCents > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from('payments')
      .select('id, status')
      .eq('team_id', parsed.data.teamId)
      .eq('league_id', league.id)
      .eq('payment_type', 'team')
      .maybeSingle()

    if (!existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('payments').insert({
        organization_id: org.id,
        team_id: parsed.data.teamId,
        league_id: league.id,
        amount_cents: amountCents,
        currency,
        status: 'pending',
        payment_type: 'team',
        payment_method: method,
      })
    } else if (existing.status !== 'paid') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('payments')
        .update({ payment_method: method, amount_cents: amountCents, currency, status: 'pending' })
        .eq('id', existing.id)
    }
  }

  // Reserve the team's spot: activate all active members' registrations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: members } = await (db as any)
    .from('team_members').select('user_id').eq('team_id', parsed.data.teamId).eq('status', 'active')
  const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean)
  if (userIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('registrations')
      .update({ status: 'active' })
      .eq('league_id', league.id)
      .in('user_id', userIds)
      .in('status', ['pending', 'waitlisted'])
  }

  const instructions =
    (league.payment_instructions?.trim() || null) ??
    (orgPay?.registration_manual_instructions ?? null)

  // Notify admins of the offline team payment selection (fire-and-forget)
  notifyRegistrationAdmin(db, org.id, user.id, league.id, league.name, method as RegistrationPaymentMethod).catch(() => {})

  revalidatePath('/admin/payments')
  return { instructions, methodLabel: PAYMENT_METHOD_LABELS[method], error: null }
}

// ── Shared admin notification helper ─────────────────────────────────────────

/**
 * Send a registration admin notification. Resolves recipients from
 * org_notification_settings (custom email or all org_admins). Never throws —
 * all callers should wrap in .catch(() => {}).
 */
async function notifyRegistrationAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  userId: string,
  leagueId: string,
  leagueName: string,
  paymentMethod: RegistrationPaymentMethod,
): Promise<void> {
  const { data: notifSettings } = await db
    .from('org_notification_settings')
    .select('registration_notifications_enabled, registration_notification_email')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!notifSettings?.registration_notifications_enabled) return

  let recipients: string[]
  if (notifSettings.registration_notification_email) {
    recipients = [notifSettings.registration_notification_email]
  } else {
    const { data: admins } = await db
      .from('org_members')
      .select('profile:profiles!org_members_user_id_fkey(email)')
      .eq('organization_id', orgId)
      .eq('role', 'org_admin')
      .eq('status', 'active')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recipients = (admins ?? []).flatMap((a: any) => {
      const email = Array.isArray(a.profile) ? a.profile[0]?.email : a.profile?.email
      return email ? [email as string] : []
    })
  }
  if (!recipients.length) return

  const { data: profile } = await db.from('profiles').select('full_name, email').eq('id', userId).single()
  const { data: org } = await db.from('organizations').select('name, slug').eq('id', orgId).single()
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const orgSlug = (org as { slug?: string } | null)?.slug
  const adminUrl = orgSlug
    ? `https://${orgSlug}.${platformDomain}/admin/players`
    : `https://${platformDomain}/admin/players`

  await sendRegistrationAdminNotification({
    to: recipients,
    playerName: (profile as { full_name?: string | null } | null)?.full_name ?? null,
    playerEmail: (profile as { email?: string | null } | null)?.email ?? null,
    leagueName,
    orgName: (org as { name?: string } | null)?.name ?? '',
    adminUrl,
    paymentMethod,
  })
}

const updatePaymentStatusSchema = z.object({
  paymentId: z.string().uuid(),
  status: z.enum(['paid', 'pending', 'failed', 'refunded']),
  notes: z.string().optional(),
})

export async function updatePaymentStatus(input: z.infer<typeof updatePaymentStatusSchema>) {
  const parsed = updatePaymentStatusSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const db = createServiceRoleClient()

  const updates: Record<string, unknown> = { status: parsed.data.status }
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes
  if (parsed.data.status === 'paid') updates.paid_at = new Date().toISOString()

  const { error } = await db
    .from('payments')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(updates as any)
    .eq('id', parsed.data.paymentId)

  if (error) return { error: error.message }
  revalidatePath('/admin/payments')
  return { error: null }
}
