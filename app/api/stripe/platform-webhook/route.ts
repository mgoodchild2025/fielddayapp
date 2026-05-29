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

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

function getPlatformStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' as any })
}

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

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.warn('[platform-webhook] STRIPE_PLATFORM_WEBHOOK_SECRET not set — skipping')
    return NextResponse.json({ received: true })
  }

  const body = await request.text()
  const sig  = request.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    const stripe = getPlatformStripe()
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[platform-webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const db = createServiceRoleClient()

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('organization_id', sub.organization_id)

        const { data: org } = await db.from('organizations').select('name, slug').eq('id', sub.organization_id).single()
        const orgUrl = `https://app.${PLATFORM_DOMAIN}/super/orgs/${sub.organization_id}`

        await sendPlatformAlert(
          'subscription_change',
          `Subscription cancelled: ${org?.name ?? sub.organization_id}`,
          `<div style="font-family:sans-serif;max-width:560px;color:#111;">
            <h2>Subscription cancelled</h2>
            <p><strong>${org?.name ?? 'Unknown org'}</strong> (${org?.slug ?? ''}) cancelled their <strong>${sub.plan_tier}</strong> subscription. Their account will drop to Free plan limits.</p>
            <a href="${orgUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">View in Super Console →</a>
          </div>`
        )
      }
    }
  }

  return NextResponse.json({ received: true })
}
