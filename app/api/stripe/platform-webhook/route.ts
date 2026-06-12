/**
 * Platform-level Stripe webhook.
 *
 * Handles events for Fieldday's own subscription billing (what orgs pay
 * Fieldday for platform access). This is separate from the org-specific
 * webhook at /api/stripe/webhook which handles player payments within orgs.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY              — Fieldday's Stripe secret key
 *   STRIPE_PLATFORM_WEBHOOK_SECRET — signing secret for this endpoint
 *     (create via: stripe listen --forward-to .../api/stripe/platform-webhook)
 *
 * Events handled:
 *   invoice.payment_failed         → mark subscription past_due, send alert
 *   customer.subscription.updated → detect plan tier change, send alert
 *   customer.subscription.deleted → mark subscription canceled, send alert
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendPlatformAlert } from '@/actions/platform-settings'
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import { constructPlatformEvent, platformEnvFor } from '@/lib/stripe-platform'
import { applySubscriptionDeletion } from '@/lib/billing-downgrade'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

/** Map a Stripe price ID back to a plan tier label */
function priceTierLabel(priceId: string | null | undefined): string {
  const map: Record<string, string> = {
    [process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '']: 'Starter',
    [process.env.STRIPE_PRICE_PRO_MONTHLY      ?? '']: 'Pro',
    [process.env.STRIPE_PRICE_CLUB_MONTHLY     ?? '']: 'Club',
    [process.env.STRIPE_PRICE_HIBERNATE_MONTHLY ?? '']: 'Hibernate',
  }
  return priceId ? (map[priceId] ?? priceId) : 'Unknown'
}

/** Map a Stripe price ID to our DB plan_tier value (or null if unrecognized). */
function priceToPlanTier(priceId: string | null | undefined): 'starter' | 'pro' | 'club' | 'hibernate' | null {
  const map: Record<string, 'starter' | 'pro' | 'club' | 'hibernate'> = {
    [process.env.STRIPE_PRICE_STARTER_MONTHLY  ?? '']: 'starter',
    [process.env.STRIPE_PRICE_PRO_MONTHLY      ?? '']: 'pro',
    [process.env.STRIPE_PRICE_CLUB_MONTHLY     ?? '']: 'club',
    [process.env.STRIPE_PRICE_HIBERNATE_MONTHLY ?? '']: 'hibernate',
  }
  return priceId ? (map[priceId] ?? null) : null
}

/** Map a Stripe subscription status to our DB status enum. */
function mapStripeStatus(s: Stripe.Subscription.Status): string {
  switch (s) {
    case 'trialing':           return 'trialing'
    case 'active':             return 'active'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':         return 'past_due'
    case 'canceled':
    case 'incomplete_expired': return 'canceled'
    case 'paused':             return 'paused'
    default:                   return 'active'
  }
}

/**
 * Write the current state of a Stripe subscription back into our subscriptions
 * row (matched by stripe_customer_id). This is the source of truth for what the
 * billing page shows — without it, plan changes made via Checkout or the Stripe
 * portal never reflect in the app.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncSubscriptionRow(db: any, subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
  if (!customerId) return

  const priceId = subscription.items.data[0]?.price?.id
  const tier = priceToPlanTier(priceId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodEndRaw = (subscription.items.data[0] as any)?.current_period_end
    ?? (subscription as any).current_period_end
  const interval = subscription.items.data[0]?.price?.recurring?.interval ?? null

  const update: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    status: mapStripeStatus(subscription.status),
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    current_period_end: periodEndRaw ? new Date(periodEndRaw * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    billing_interval: interval,
    updated_at: new Date().toISOString(),
  }
  // Only set plan_tier for the recognized paid plans. Hibernate is managed by a
  // dedicated action (pre_hibernate_tier), so don't clobber plan_tier for it.
  if (tier === 'starter' || tier === 'pro' || tier === 'club') {
    update.plan_tier = tier
  }
  // If the subscription is no longer set to cancel, any scheduled downgrade was
  // undone (e.g. via the Stripe portal) — clear the pending fields.
  if (!subscription.cancel_at_period_end) {
    update.pending_plan_tier = null
    update.pending_plan_effective = null
  }

  await db.from('subscriptions').update(update).eq('stripe_customer_id', customerId)
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig  = request.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  // Verify against BOTH live + test signing secrets so events validate
  // regardless of the active platform Stripe mode.
  const event = constructPlatformEvent(body, sig)
  if (!event) {
    console.error('[platform-webhook] signature verification failed (no matching secret)')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const db = createServiceRoleClient()
  // Use the key matching THIS event's mode (test vs live), so subscription
  // retrieves work regardless of the active toggle.
  const eventEnv = platformEnvFor(event.livemode ? 'live' : 'test')
  const stripe = new Stripe(eventEnv.secretKey ?? 'sk_placeholder', { apiVersion: '2026-05-27.dahlia' as const })

  // ── checkout.session.completed ────────────────────────────────────────────
  // Fires when an org admin finishes paying for a plan via Stripe Checkout.
  // This is what makes a newly-chosen plan show up on the billing page.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode === 'subscription' && session.subscription) {
      const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
      try {
        const subscription = await stripe.subscriptions.retrieve(subId)
        await syncSubscriptionRow(db, subscription)
      } catch (err) {
        console.error('[platform-webhook] checkout.session.completed sync failed:', err)
      }
    }
    return NextResponse.json({ received: true })
  }

  // ── customer.subscription.created ─────────────────────────────────────────
  if (event.type === 'customer.subscription.created') {
    await syncSubscriptionRow(db, event.data.object as Stripe.Subscription)
    return NextResponse.json({ received: true })
  }

  // ── invoice.payment_failed ────────────────────────────────────────────────
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id

    if (customerId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sub } = await (db as any)
        .from('subscriptions')
        .select('organization_id, plan_tier')
        .eq('stripe_customer_id', customerId)
        .single() as { data: { organization_id: string; plan_tier: string } | null }

      if (sub) {
        // Update subscription status to past_due
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('organization_id', sub.organization_id)

        const { data: org } = await db
          .from('organizations')
          .select('name, slug')
          .eq('id', sub.organization_id)
          .single()

        const orgUrl = `https://app.${PLATFORM_DOMAIN}/super/orgs/${sub.organization_id}`
        const amount = invoice.amount_due ? `$${(invoice.amount_due / 100).toFixed(2)}` : '(unknown amount)'

        await sendPlatformAlert(
          'billing_failure',
          `Billing failure: ${org?.name ?? sub.organization_id}`,
          `<div style="font-family:sans-serif;max-width:560px;color:#111;">
            <h2 style="color:#dc2626;">Stripe payment failed</h2>
            <p><strong>${org?.name ?? 'Unknown org'}</strong> (${org?.slug ?? ''}) had a payment failure.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
              <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Plan</td><td>${sub.plan_tier}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Amount</td><td>${amount}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Invoice</td><td style="font-family:monospace;">${invoice.id}</td></tr>
            </table>
            <p style="color:#6b7280;font-size:13px;">Stripe will retry automatically. The org will see a "Payment past due" banner in their admin panel.</p>
            <a href="${orgUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">View org in Super Console →</a>
          </div>`
        )
      }
    }
  }

  // ── customer.subscription.updated ────────────────────────────────────────
  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription
    const previousAttributes = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

    // Always persist the latest state (plan tier, status, period end, cancel flag)
    await syncSubscriptionRow(db, subscription)

    if (customerId) {
      const newPriceId = subscription.items.data[0]?.price?.id
      const oldPriceId = (previousAttributes?.items as Stripe.ApiList<Stripe.SubscriptionItem> | undefined)?.data?.[0]?.price?.id

      // Only alert if the price actually changed (not just metadata updates etc.)
      if (newPriceId && oldPriceId && newPriceId !== oldPriceId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sub } = await (db as any)
          .from('subscriptions')
          .select('organization_id, plan_tier')
          .eq('stripe_customer_id', customerId)
          .single() as { data: { organization_id: string; plan_tier: string } | null }

        if (sub) {
          const { data: org } = await db.from('organizations').select('name, slug').eq('id', sub.organization_id).single()
          const oldTier = priceTierLabel(oldPriceId)
          const newTier = priceTierLabel(newPriceId)
          const orgUrl = `https://app.${PLATFORM_DOMAIN}/super/orgs/${sub.organization_id}`

          await sendPlatformAlert(
            'subscription_change',
            `Subscription changed: ${org?.name ?? sub.organization_id} → ${newTier}`,
            `<div style="font-family:sans-serif;max-width:560px;color:#111;">
              <h2>Subscription plan changed</h2>
              <p><strong>${org?.name ?? 'Unknown org'}</strong> (${org?.slug ?? ''}) changed their plan via the Stripe portal.</p>
              <p>${oldTier} → <strong>${newTier}</strong></p>
              <a href="${orgUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">View in Super Console →</a>
            </div>`
          )

          await recordAuditLog({
            orgId: sub.organization_id,
            actorUserId: null,
            actorLabel: 'Stripe (portal)',
            action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
            targetType: 'subscription',
            targetId: sub.organization_id,
            targetLabel: org?.name ?? null,
            metadata: { from: oldTier, to: newTier, via: 'stripe_portal' },
          })
        }
      }
    }
  }

  // ── customer.subscription.deleted ─────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

    if (customerId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sub } = await (db as any)
        .from('subscriptions')
        .select('organization_id, plan_tier')
        .eq('stripe_customer_id', customerId)
        .single() as { data: { organization_id: string; plan_tier: string } | null }

      if (sub) {
        // Apply the scheduled change: re-subscribe at a pending lower paid tier,
        // or drop cleanly to Free.
        const outcome = await applySubscriptionDeletion(subscription, event.livemode ? 'live' : 'test')

        const { data: org } = await db.from('organizations').select('name, slug').eq('id', sub.organization_id).single()
        const orgUrl = `https://app.${PLATFORM_DOMAIN}/super/orgs/${sub.organization_id}`

        const landed = outcome.result === 'resubscribed'
          ? `re-subscribed at the <strong>${outcome.tier}</strong> plan`
          : 'dropped to <strong>Free</strong> plan limits'

        await sendPlatformAlert(
          'subscription_change',
          `Subscription ended: ${org?.name ?? sub.organization_id} → ${outcome.tier}`,
          `<div style="font-family:sans-serif;max-width:560px;color:#111;">
            <h2>Subscription period ended</h2>
            <p><strong>${org?.name ?? 'Unknown org'}</strong> (${org?.slug ?? ''}) ended their <strong>${sub.plan_tier}</strong> subscription and ${landed}.</p>
            <a href="${orgUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">View in Super Console →</a>
          </div>`
        )

        await recordAuditLog({
          orgId: sub.organization_id,
          actorUserId: null,
          actorLabel: 'Stripe',
          action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
          targetType: 'subscription',
          targetId: sub.organization_id,
          targetLabel: org?.name ?? null,
          metadata: { from: sub.plan_tier, to: outcome.tier, via: 'scheduled_downgrade' },
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}
