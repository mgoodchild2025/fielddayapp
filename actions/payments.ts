'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { assertPaymentAdmin } from '@/lib/auth'
import { resolveLeagueMethods, isOfflineMethod, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/payment-methods'
import { sendRegistrationAdminNotification, type RegistrationPaymentMethod } from './emails'
import { recordAuditLog, AUDIT_ACTIONS, getAuditActor } from '@/lib/audit'
import { getOrgTaxRates, ratesForScope, computeTax } from '@/lib/tax'
import { registrationBasePriceCents, applyDiscountCode, teamFeeCents } from '@/lib/registration-price'

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
      .select('id, user_id, organization_id, league_id, status, registration_type')
      .eq('id', parsed.data.registrationId).maybeSingle(),

    db.from('leagues')
      .select('id, name, price_cents, currency, payment_methods, payment_instructions, drop_in_price_cents, early_bird_price_cents, early_bird_deadline, event_type, season_pass_prorate')
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

  if (reg.league_id !== league.id) return { instructions: null, methodLabel: '', error: 'Registration not found' }

  // Price + discount computed here, exactly as the card checkout does — the
  // client used to send discountedAmountCents and it was trusted (a player
  // could record $0.01 owed). The code is re-validated; any amount the client
  // sends is ignored.
  const base = await registrationBasePriceCents(db, org.id, league.id, league, reg.registration_type)
  const discounted = await applyDiscountCode(db, org.id, parsed.data.discountId, base.priceCents, base.isDropIn ? 'dropins' : 'leagues')
  const subtotalCents = discounted.priceCents
  // Offline payers owe the SAME gross a card payer is charged: discounts
  // first, then tax — the shared helper keeps both worlds identical.
  const offlineTax = computeTax(subtotalCents, ratesForScope(await getOrgTaxRates(db, org.id), 'registrations'))
  const amountCents = offlineTax.totalCents
  const currency = league.currency ?? 'cad'

  // Whether to alert admins. Only a genuinely new offline selection (or a real
  // method change) warrants it — repeating the same method (page re-run, double
  // click, the flow re-invoking this) must NOT re-send an identical email.
  let shouldNotify = true

  // A code that makes it free is still a recorded outcome: a $0 'manual'
  // payment naming the code. (activateRegistration lets a player complete
  // their own registration only when it's free or a payment is recorded.)
  if (amountCents === 0 && discounted.discount) {
    const { data: prior } = await db.from('payments').select('id').eq('registration_id', reg.id).eq('organization_id', org.id).limit(1).maybeSingle()
    if (!prior) {
      await db.from('payments').insert({
        organization_id: org.id, registration_id: reg.id, user_id: user.id, league_id: league.id,
        amount_cents: 0, tax_cents: 0, currency, status: 'manual', payment_method: method,
        discount_code_id: discounted.discount.id, discount_cents: discounted.discount.cents,
      })
    }
  }

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
        discount_code_id: discounted.discount?.id ?? null,
        discount_cents: discounted.discount?.cents ?? 0,
      })
      shouldNotify = true
    } else if (existing.status !== 'paid') {

      await db.from('payments')
        .update({
          payment_method: method, amount_cents: amountCents, tax_cents: offlineTax.taxCents, currency, status: 'pending',
          discount_code_id: discounted.discount?.id ?? null,
          discount_cents: discounted.discount?.cents ?? 0,
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
  /** Ignored — kept so older clients still validate. The amount is computed server-side. */
  discountedAmountCents: z.number().int().nonnegative().optional(),
  /** Discount code the captain applied; re-validated server-side. */
  discountId: z.string().uuid().optional(),
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

    db.from('leagues').select('id, name, price_cents, currency, payment_methods, payment_instructions, early_bird_price_cents, early_bird_deadline')
      .eq('id', parsed.data.leagueId).eq('organization_id', org.id).maybeSingle(),

    db.from('org_payment_settings')
      .select('stripe_secret_key, registration_payment_mode, registration_manual_instructions')
      .eq('organization_id', org.id).maybeSingle(),

    db.from('team_members').select('role')
      .eq('team_id', parsed.data.teamId).eq('user_id', user.id).eq('status', 'active').maybeSingle(),

    db.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).eq('status', 'active').maybeSingle(),
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

  // Team fee + re-validated discount, as the card checkout computes it — never
  // the client's amount (it was trusted: a captain could record $0 owed and,
  // with $0, no payment row at all).
  const teamDiscounted = await applyDiscountCode(db, org.id, parsed.data.discountId, teamFeeCents(league), 'leagues')
  const teamSubtotalCents = teamDiscounted.priceCents
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
        discount_code_id: teamDiscounted.discount?.id ?? null,
        discount_cents: teamDiscounted.discount?.cents ?? 0,
      })
    } else if (existing.status !== 'paid') {

      await db.from('payments')
        .update({
          payment_method: method, amount_cents: amountCents, tax_cents: teamOfflineTax.taxCents, currency, status: 'pending',
          discount_code_id: teamDiscounted.discount?.id ?? null,
          discount_cents: teamDiscounted.discount?.cents ?? 0,
        })
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

// ── Admin: edit/record a registrant's payment (per-player) ───────────────────

const adminUpdatePaymentSchema = z.object({
  registrationId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  status: z.enum(['paid', 'pending', 'refunded']),
  method: z.enum(['cash', 'etransfer', 'cheque', 'stripe', 'card', 'other']),
  notes: z.string().optional(),
  /** How much was returned when status is 'refunded' (defaults to the full amount). */
  refundAmountCents: z.number().int().min(0).optional(),
})

/**
 * Org-admin edit (or create) of a single registration's payment. Works on
 * already-paid rows and on free ($0) events, and lets the admin set the
 * status (paid / pending / refunded) and amount directly. Per-player payments
 * only (keyed by registration_id); per-team fees go through
 * adminUpdateTeamPayment.
 */
export async function adminUpdateRegistrationPayment(input: z.infer<typeof adminUpdatePaymentSchema>) {
  const parsed = adminUpdatePaymentSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertPaymentAdmin(org)
  if (auth.error) return { error: auth.error }

  const db = createServiceRoleClient()
  const { data: reg } = await db
    .from('registrations')
    .select('id, user_id, league_id')
    .eq('id', parsed.data.registrationId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!reg) return { error: 'Registration not found' }

  const isPaid = parsed.data.status === 'paid'
  const isRefund = parsed.data.status === 'refunded'
  const refundCents = isRefund
    ? Math.min(parsed.data.refundAmountCents ?? parsed.data.amountCents, parsed.data.amountCents)
    : 0
  const fields = {
    amount_cents: parsed.data.amountCents,
    status: parsed.data.status,
    payment_method: parsed.data.method,
    notes: parsed.data.notes?.trim() || null,
    paid_at: isPaid ? new Date().toISOString() : null,
    // Refunds land in the period they're issued; any other status clears them.
    refunded_cents: refundCents,
    refunded_at: isRefund ? new Date().toISOString() : null,
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

// ── Admin: edit/record a team's fee (per-team events) ────────────────────────

const adminUpdateTeamPaymentSchema = z.object({
  teamId: z.string().uuid(),
  leagueId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  status: z.enum(['paid', 'pending', 'refunded']),
  method: z.enum(['cash', 'etransfer', 'cheque', 'stripe', 'card', 'other']),
  notes: z.string().optional(),
  /** How much was returned when status is 'refunded' (defaults to the full amount). */
  refundAmountCents: z.number().int().min(0).optional(),
})

/**
 * The per-team twin of adminUpdateRegistrationPayment: one editor (the
 * status badge on Admin → Payments) records, edits, and refunds a team's fee.
 *
 * Team fees live on payment_type='team' rows keyed by team_id, and the
 * repeated-Mark-as-Paid bug left duplicate rows in the wild, so this edits the
 * SAME row the ledger displays (a paid row if the team has one, else the
 * newest) and never inserts while one exists. Marking paid also sweeps the
 * team's other never-paid offline rows (so stale pendings can't keep
 * "payment outstanding" banners alive) and activates the members'
 * registrations.
 */
export async function adminUpdateTeamPayment(input: z.infer<typeof adminUpdateTeamPaymentSchema>) {
  const parsed = adminUpdateTeamPaymentSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }
  const { teamId, leagueId } = parsed.data

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertPaymentAdmin(org)
  if (auth.error) return { error: auth.error }

  const db = createServiceRoleClient()

  // The team must belong to this org's per-team league.
  const [{ data: team }, { data: league }] = await Promise.all([
    db.from('teams').select('id').eq('id', teamId).eq('league_id', leagueId).eq('organization_id', org.id).maybeSingle(),
    db.from('leagues').select('payment_mode, currency').eq('id', leagueId).eq('organization_id', org.id).maybeSingle(),
  ])
  if (!team || !league) return { error: 'Team not found' }
  if (league.payment_mode !== 'per_team') return { error: 'This event is paid per player, not per team.' }

  const isPaid = parsed.data.status === 'paid'
  const isRefund = parsed.data.status === 'refunded'
  const refundCents = isRefund
    ? Math.min(parsed.data.refundAmountCents ?? parsed.data.amountCents, parsed.data.amountCents)
    : 0
  const fields = {
    amount_cents: parsed.data.amountCents,
    status: parsed.data.status,
    payment_method: parsed.data.method,
    notes: parsed.data.notes?.trim() || null,
    paid_at: isPaid ? new Date().toISOString() : null,
    // Refunds land in the period they're issued; any other status clears them.
    refunded_cents: refundCents,
    refunded_at: isRefund ? new Date().toISOString() : null,
  }

  const { data: teamRows } = await db
    .from('payments')
    .select('id, status')
    .eq('team_id', teamId)
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .eq('payment_type', 'team')
    .order('created_at', { ascending: false })
  const target = (teamRows ?? []).find((p) => p.status === 'paid' || p.status === 'manual') ?? (teamRows ?? [])[0]

  let targetId: string
  if (target) {
    const { error } = await db.from('payments').update(fields).eq('id', target.id)
    if (error) return { error: error.message }
    targetId = target.id
  } else {
    const { data: created, error } = await db.from('payments').insert({
      organization_id: org.id,
      team_id: teamId,
      league_id: leagueId,
      payment_type: 'team',
      currency: league.currency ?? 'cad',
      ...fields,
    }).select('id').single()
    if (error || !created) return { error: error?.message ?? 'Could not save the payment' }
    targetId = created.id
  }

  if (isPaid) {
    await db.from('payments')
      .delete()
      .eq('team_id', teamId)
      .eq('league_id', leagueId)
      .eq('organization_id', org.id)
      .eq('payment_type', 'team')
      .eq('status', 'pending')
      .in('payment_method', ['cash', 'etransfer', 'cheque'])
      .neq('id', targetId)

    const { data: members } = await db
      .from('team_members').select('user_id').eq('team_id', teamId).eq('status', 'active')
    const memberUserIds = (members ?? []).map((m) => m.user_id).filter((id): id is string => !!id)
    if (memberUserIds.length > 0) {
      await db.from('registrations')
        .update({ status: 'active' })
        .eq('league_id', leagueId)
        .eq('organization_id', org.id)
        .in('user_id', memberUserIds)
        .in('status', ['pending', 'waitlisted'])
    }
  }

  const actor = await getAuditActor()
  await recordAuditLog({
    orgId: org.id,
    actorUserId: actor.actorUserId,
    actorLabel: actor.actorLabel,
    action: AUDIT_ACTIONS.PAYMENT_MANUAL_RECORDED,
    targetType: 'team',
    targetId: teamId,
    metadata: {
      league_id: leagueId,
      amount_cents: parsed.data.amountCents,
      status: parsed.data.status,
      method: parsed.data.method,
      refunded_cents: refundCents,
      payment_mode: 'per_team',
      edited: true,
    },
  })

  revalidatePath('/admin/payments')
  return { error: null }
}
