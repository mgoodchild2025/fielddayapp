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
import { getOrgTaxRates, ratesForScope, computeTax } from '@/lib/tax'

const recordManualPaymentSchema = z.object({
  registrationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  /** Per-team events: pay the TEAM directly (no registration/user needed). */
  teamId: z.string().uuid().optional(),
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

  const { data: leagueRow } = await db
    .from('leagues')
    .select('payment_mode')
    .eq('id', parsed.data.leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (leagueRow?.payment_mode === 'per_team') {
    // Team is either named directly (payments-ledger team rows) or resolved
    // from the member the admin clicked.
    let teamId: string | null = parsed.data.teamId ?? null
    if (!teamId && parsed.data.userId) {

      const { data: leagueTeams } = await db
        .from('teams')
        .select('id')
        .eq('league_id', parsed.data.leagueId)
        .eq('organization_id', org.id)
      const leagueTeamIds: string[] = (leagueTeams ?? []).map((t: { id: string }) => t.id)

      if (leagueTeamIds.length > 0) {

        const { data: teamMember } = await db
          .from('team_members')
          .select('team_id')
          .eq('user_id', parsed.data.userId)
          .in('team_id', leagueTeamIds)
          .eq('status', 'active')
          .maybeSingle()
        teamId = teamMember?.team_id ?? null
      }
    }

    if (teamId) {
      // Find the pending team payment row created by selectOfflineTeamPayment

      // Fetch ALL of the team's rows: a repeat click used to find no pending
      // row and insert a duplicate paid one, and .maybeSingle() errors on the
      // duplicates it created. Update the pending row if there is one, else
      // re-record onto the existing paid row; insert only when none exist.
      const { data: teamPaymentRows } = await db
        .from('payments')
        .select('id, status')
        .eq('team_id', teamId)
        .eq('league_id', parsed.data.leagueId)
        .eq('organization_id', org.id)
        .eq('payment_type', 'team')
        .order('created_at', { ascending: false })
      const targetTeamPayment = (teamPaymentRows ?? []).find((p) => p.status !== 'paid')
        ?? (teamPaymentRows ?? [])[0]

      if (targetTeamPayment) {

        const { error } = await db
          .from('payments')
          .update(paidFields)
          .eq('id', targetTeamPayment.id)
        if (error) return { data: null, error: error.message }
      } else {
        // No team payment row exists yet — admin is recording a manual
        // cash payment without a prior selectOfflineTeamPayment call; create one.

        const { error } = await db.from('payments').insert({
          organization_id: org.id,
          team_id: teamId,
          league_id: parsed.data.leagueId,
          payment_type: 'team',
          ...paidFields,
        })
        if (error) return { data: null, error: error.message }
      }

      // The team is paid: sweep any OTHER never-paid offline team rows for this
      // league so stale pendings can't keep "outstanding" reminders alive.
      if (targetTeamPayment) {
        await db.from('payments')
          .delete()
          .eq('team_id', teamId)
          .eq('league_id', parsed.data.leagueId)
          .eq('organization_id', org.id)
          .eq('payment_type', 'team')
          .eq('status', 'pending')
          .in('payment_method', ['cash', 'etransfer', 'cheque'])
          .neq('id', targetTeamPayment.id)
      }

      // Activate all active team members' registrations in case any are still pending

      const { data: members } = await db
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .eq('status', 'active')
      const memberUserIds: string[] = (members ?? [])
        .map((m) => m.user_id)
        .filter((id): id is string => !!id)
      if (memberUserIds.length > 0) {

        await db
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
        targetType: parsed.data.registrationId ? 'registration' : 'team',
        targetId: parsed.data.registrationId ?? teamId,
        metadata: {
          user_id: parsed.data.userId ?? null,
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

  // Per-player path below is keyed by registration.
  if (!parsed.data.registrationId || !parsed.data.userId) {
    return { data: null, error: 'Registration not found' }
  }

  // Reconcile an existing pending payment (e.g. an offline method the player
  // chose at checkout) instead of inserting a duplicate.

  const { data: existing } = await db
    .from('payments')
    .select('id')
    .eq('registration_id', parsed.data.registrationId)
    .eq('organization_id', org.id)
    .neq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {

    const { error } = await db.from('payments').update(paidFields).eq('id', existing.id)
    if (error) return { data: null, error: error.message }
  } else {

    const { error } = await db.from('payments').insert({
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
  /** Discount applied (for admin visibility on the payment). */
  discountId: z.string().uuid().optional(),
  discountCents: z.number().int().nonnegative().optional(),
})

/**
 * Player picks an offline payment method at checkout. We reserve the spot
 * immediately (activate the registration) and record a PENDING payment for the
 * admin to reconcile. Returns the instructions to show the player.
 */
export async function selectOfflinePayment(
  input: z.infer<typeof selectOfflinePaymentSchema>
): Promise<{ instructions: string | null; methodLabel: string; amountCents?: number; taxCents?: number; error: string | null }> {
  const parsed = selectOfflinePaymentSchema.safeParse(input)
  if (!parsed.success) return { instructions: null, methodLabel: '', error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { instructions: null, methodLabel: '', error: 'Not authenticated' }

  const db = createServiceRoleClient()

  const [{ data: reg }, { data: league }, { data: orgPay }] = await Promise.all([

    db.from('registrations')
      .select('id, user_id, organization_id, league_id, status')
      .eq('id', parsed.data.registrationId).maybeSingle(),

    db.from('leagues')
      .select('id, name, price_cents, currency, payment_methods, payment_instructions')
      .eq('id', parsed.data.leagueId).eq('organization_id', org.id).maybeSingle(),

    db.from('org_payment_settings')
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
  const subtotalCents = parsed.data.discountedAmountCents ?? league.price_cents ?? 0
  // Offline payers owe the SAME gross a card payer is charged: discounts
  // first, then tax — the shared helper keeps both worlds identical.
  const offlineTax = computeTax(subtotalCents, ratesForScope(await getOrgTaxRates(db, org.id), 'registrations'))
  const amountCents = offlineTax.totalCents
  const currency = league.currency ?? 'cad'

  // Whether to alert admins. Only a genuinely new offline selection (or a real
  // method change) warrants it — repeating the same method (page re-run, double
  // click, the flow re-invoking this) must NOT re-send an identical email.
  let shouldNotify = true

  // Record a pending payment (skip when free) — reuse any existing row.
  if (amountCents > 0) {

    const { data: existing } = await db
      .from('payments')
      .select('id, status, payment_method')
      .eq('registration_id', reg.id)
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!existing) {

      await db.from('payments').insert({
        organization_id: org.id,
        registration_id: reg.id,
        user_id: user.id,
        league_id: league.id,
        amount_cents: amountCents,
        tax_cents: offlineTax.taxCents,
        currency,
        status: 'pending',
        payment_method: method,
        discount_code_id: parsed.data.discountId ?? null,
        discount_cents: parsed.data.discountCents ?? 0,
      })
      shouldNotify = true
    } else if (existing.status !== 'paid') {

      await db.from('payments')
        .update({
          payment_method: method, amount_cents: amountCents, tax_cents: offlineTax.taxCents, currency, status: 'pending',
          discount_code_id: parsed.data.discountId ?? null,
          discount_cents: parsed.data.discountCents ?? 0,
        })
        .eq('id', existing.id)
      // Re-notify only if the player actually switched methods.
      shouldNotify = existing.payment_method !== method
    } else {
      // Payment already marked paid — nothing to collect, don't re-alert.
      shouldNotify = false
    }
  }

  // NOTE: we intentionally do NOT activate the registration here. The flow's
  // "Done" button activates it (activateRegistration) and routes to /success.
  // Activating here would trigger the register page's active-registration
  // redirect on the Server Action refresh, flashing past the instructions.

  const instructions =
    (league.payment_instructions?.trim() || null) ??
    (orgPay?.registration_manual_instructions ?? null)

  // Notify admins so they know to follow up and collect payment (fire-and-forget).
  // Guarded so a repeated selection of the same method doesn't re-alert.
  if (shouldNotify) {
    notifyRegistrationAdmin(db, org.id, reg.user_id, league.id, league.name, method as RegistrationPaymentMethod).catch(() => {})
  }

  revalidatePath('/admin/payments')
  return { instructions, methodLabel: PAYMENT_METHOD_LABELS[method], amountCents, taxCents: offlineTax.taxCents, error: null }
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
): Promise<{ instructions: string | null; methodLabel: string; amountCents?: number; taxCents?: number; error: string | null }> {
  const parsed = selectOfflineTeamPaymentSchema.safeParse(input)
  if (!parsed.success) return { instructions: null, methodLabel: '', error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { instructions: null, methodLabel: '', error: 'Not authenticated' }

  const db = createServiceRoleClient()

  const [{ data: team }, { data: league }, { data: orgPay }, { data: membership }, { data: orgMember }] = await Promise.all([

    db.from('teams').select('id, organization_id, league_id').eq('id', parsed.data.teamId).maybeSingle(),

    db.from('leagues').select('id, name, price_cents, currency, payment_methods, payment_instructions')
      .eq('id', parsed.data.leagueId).eq('organization_id', org.id).maybeSingle(),

    db.from('org_payment_settings')
      .select('stripe_secret_key, registration_payment_mode, registration_manual_instructions')
      .eq('organization_id', org.id).maybeSingle(),

    db.from('team_members').select('role')
      .eq('team_id', parsed.data.teamId).eq('user_id', user.id).eq('status', 'active').maybeSingle(),

    db.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).maybeSingle(),
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

  const teamSubtotalCents = parsed.data.discountedAmountCents ?? league.price_cents ?? 0
  const teamOfflineTax = computeTax(teamSubtotalCents, ratesForScope(await getOrgTaxRates(db, org.id), 'registrations'))
  const amountCents = teamOfflineTax.totalCents
  const currency = league.currency ?? 'cad'

  // Pending team payment (reuse existing team payment row if present).
  if (amountCents > 0) {

    const { data: existingRows } = await db
      .from('payments')
      .select('id, status')
      .eq('team_id', parsed.data.teamId)
      .eq('league_id', league.id)
      .eq('payment_type', 'team')
      .order('created_at', { ascending: false })
    // Prefer a paid row (never downgrade it), else reuse the newest.
    const existing = (existingRows ?? []).find((p) => p.status === 'paid') ?? (existingRows ?? [])[0] ?? null

    if (!existing) {

      await db.from('payments').insert({
        organization_id: org.id,
        team_id: parsed.data.teamId,
        league_id: league.id,
        amount_cents: amountCents,
        tax_cents: teamOfflineTax.taxCents,
        currency,
        status: 'pending',
        payment_type: 'team',
        payment_method: method,
      })
    } else if (existing.status !== 'paid') {

      await db.from('payments')
        .update({ payment_method: method, amount_cents: amountCents, tax_cents: teamOfflineTax.taxCents, currency, status: 'pending' })
        .eq('id', existing.id)
    }
  }

  // Reserve the team's spot: activate all active members' registrations.

  const { data: members } = await db
    .from('team_members').select('user_id').eq('team_id', parsed.data.teamId).eq('status', 'active')
  const userIds = (members ?? []).map((m) => m.user_id).filter((id): id is string => !!id)
  if (userIds.length > 0) {

    await db.from('registrations')
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
  return { instructions, methodLabel: PAYMENT_METHOD_LABELS[method], amountCents, taxCents: teamOfflineTax.taxCents, error: null }
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

// ── Admin: edit/record a registrant's payment (per-player) ───────────────────

const adminUpdatePaymentSchema = z.object({
  registrationId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  status: z.enum(['paid', 'pending', 'refunded']),
  method: z.enum(['cash', 'etransfer', 'cheque', 'stripe', 'card', 'other']),
  notes: z.string().optional(),
})

/**
 * Org-admin edit (or create) of a single registration's payment. Unlike
 * recordManualPayment, this works on already-paid rows and on free ($0) events,
 * and lets the admin set the status (paid / pending / refunded) and amount
 * directly. Per-player payments only (the payments table is keyed by
 * registration_id); per-team events keep using recordManualPayment.
 */
export async function adminUpdateRegistrationPayment(input: z.infer<typeof adminUpdatePaymentSchema>) {
  const parsed = adminUpdatePaymentSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

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


  const { data: reg } = await db
    .from('registrations')
    .select('id, user_id, league_id')
    .eq('id', parsed.data.registrationId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!reg) return { error: 'Registration not found' }

  const isPaid = parsed.data.status === 'paid'
  const fields = {
    amount_cents: parsed.data.amountCents,
    status: parsed.data.status,
    payment_method: parsed.data.method,
    notes: parsed.data.notes?.trim() || null,
    paid_at: isPaid ? new Date().toISOString() : null,
  }


  const { data: existing } = await db
    .from('payments')
    .select('id')
    .eq('registration_id', parsed.data.registrationId)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {

    const { error } = await db.from('payments').update(fields).eq('id', existing.id)
    if (error) return { error: error.message }
  } else {

    const { error } = await db.from('payments').insert({
      organization_id: org.id,
      registration_id: parsed.data.registrationId,
      user_id: reg.user_id,   // may be null for guest registrations
      league_id: reg.league_id,
      payment_type: 'player',
      currency: 'cad',
      ...fields,
    })
    if (error) return { error: error.message }
  }

  // Mark active when paid; don't touch the registration otherwise.
  if (isPaid) {
    await db.from('registrations').update({ status: 'active' }).eq('id', parsed.data.registrationId)
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
      amount_cents: parsed.data.amountCents,
      status: parsed.data.status,
      method: parsed.data.method,
      edited: true,
    },
  })

  revalidatePath('/admin/payments')
  if (reg.league_id) revalidatePath(`/admin/events/${reg.league_id}/registrations`)
  return { error: null }
}
