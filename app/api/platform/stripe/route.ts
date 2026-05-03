/**
 * Platform-level Stripe webhook — handles Fieldday's own subscription billing events.
 * Route: POST /api/platform/stripe
 *
 * This is separate from the per-org Stripe Connect webhook at /api/stripe/webhook.
 * Configure this endpoint in your Fieldday Stripe dashboard with the secret stored
 * in STRIPE_PLATFORM_WEBHOOK_SECRET.
 *
 * Events handled:
 *   checkout.session.completed       → activate subscription in DB
 *   customer.subscription.updated    → sync status/tier/dates
 *   customer.subscription.deleted    → mark canceled
 *   customer.subscription.trial_will_end → send reminder email
 *   invoice.payment_succeeded        → ensure status = active
 *   invoice.payment_failed           → mark past_due, send email
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { Resend } from 'resend'

const WEBHOOK_SECRET = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET ?? ''
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'hello@fielddayapp.ca'
const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

// In Stripe SDK v22+, current_period_end moved from Subscription to SubscriptionItem.
// Invoice.subscription moved to Invoice.parent.subscription_details.subscription.
// We use `as any` casts to bridge the API version gap.

function getSubPeriodEnd(sub: Stripe.Subscription): string | null {
  // Try SubscriptionItem first (v22+ API)
  const itemEnd = sub.items?.data?.[0]?.current_period_end
  if (itemEnd) return new Date(itemEnd * 1000).toISOString()
  // Fallback: older API shape still on root object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootEnd = (sub as any).current_period_end as number | undefined
  if (rootEnd) return new Date(rootEnd * 1000).toISOString()
  return null
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // v22+ API: Invoice.parent.subscription_details.subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parent = (invoice as any).parent as { subscription_details?: { subscription?: string | Stripe.Subscription } } | null
  if (parent?.subscription_details?.subscription) {
    const s = parent.subscription_details.subscription
    return typeof s === 'string' ? s : s.id
  }
  // Fallback: older API shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacySub = (invoice as any).subscription as string | Stripe.Subscription | null
  if (!legacySub) return null
  return typeof legacySub === 'string' ? legacySub : legacySub.id
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig || !WEBHOOK_SECRET) {
    console.error('[platform/stripe] Missing signature or webhook secret')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET)
  } catch (err) {
    console.error('[platform/stripe] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  try {
    switch (event.type) {

      // ── Checkout completed → subscription started ─────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const orgId = session.metadata?.organization_id
        const planTier = session.metadata?.plan_tier as string
        const stripeSubId = session.subscription as string
        const customerId = session.customer as string

        if (!orgId) {
          console.warn('[platform/stripe] checkout.session.completed: no organization_id in metadata')
          break
        }

        const sub = await stripe.subscriptions.retrieve(stripeSubId)
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null
        const periodEnd = getSubPeriodEnd(sub)

        await db.from('subscriptions').upsert(
          {
            organization_id: orgId,
            stripe_subscription_id: stripeSubId,
            stripe_customer_id: customerId,
            plan_tier: planTier ?? 'pro',
            billing_interval: 'month',
            status: sub.status === 'trialing' ? 'trialing' : 'active',
            trial_end: trialEnd,
            current_period_end: periodEnd,
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id' }
        )

        await db.from('organizations')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', orgId)

        console.log(`[platform/stripe] Subscription activated for org ${orgId} (${planTier})`)
        break
      }

      // ── Subscription updated (plan change, cancel scheduled, etc.) ─────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.organization_id
        if (!orgId) break

        const planTier = (sub.metadata?.plan_tier ?? sub.items.data[0]?.price?.metadata?.plan_tier ?? 'pro') as string
        const periodEnd = getSubPeriodEnd(sub)
        const interval = sub.items.data[0]?.price?.recurring?.interval ?? 'month'

        const statusMap: Record<string, string> = {
          active:   'active',
          trialing: 'trialing',
          past_due: 'past_due',
          canceled: 'canceled',
          paused:   'paused',
        }

        await db.from('subscriptions')
          .update({
            plan_tier: planTier,
            status: statusMap[sub.status] ?? 'active',
            billing_interval: interval,
            current_period_end: periodEnd,
            trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            cancel_at_period_end: sub.cancel_at_period_end,
            canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', orgId)

        if (sub.status === 'active') {
          await db.from('organizations')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', orgId)
        }

        console.log(`[platform/stripe] Subscription updated for org ${orgId} → ${sub.status}`)
        break
      }

      // ── Subscription deleted (canceled immediately) ───────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.organization_id
        if (!orgId) break

        await db.from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', orgId)

        await db.from('organizations')
          .update({ status: 'suspended', updated_at: new Date().toISOString() })
          .eq('id', orgId)

        console.log(`[platform/stripe] Subscription deleted for org ${orgId}`)
        break
      }

      // ── Trial ending soon (3 days before) → send reminder ────────────────
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.organization_id
        if (!orgId) break

        const { data: org } = await db.from('organizations')
          .select('name, slug')
          .eq('id', orgId)
          .single()

        const { data: adminMember } = await db
          .from('org_members')
          .select('user_id')
          .eq('organization_id', orgId)
          .eq('role', 'org_admin')
          .limit(1)
          .single()

        if (adminMember?.user_id && org) {
          const { data: profile } = await db
            .from('profiles')
            .select('email, full_name')
            .eq('id', adminMember.user_id)
            .single()

          if (profile?.email) {
            const trialEnd = sub.trial_end
              ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'long' }).format(new Date(sub.trial_end * 1000))
              : 'soon'

            try {
              const resend = new Resend(process.env.RESEND_API_KEY)
              await resend.emails.send({
                from: FROM_EMAIL,
                to: profile.email,
                subject: `Your Fieldday trial ends ${trialEnd} — choose a plan to continue`,
                html: buildTrialEndingEmail({
                  name: profile.full_name ?? 'there',
                  orgName: org.name,
                  orgSlug: org.slug,
                  trialEnd,
                }),
              })
              console.log(`[platform/stripe] Trial reminder sent to ${profile.email} for org ${orgId}`)
            } catch (emailErr) {
              console.error('[platform/stripe] Failed to send trial reminder email:', emailErr)
            }
          }
        }
        break
      }

      // ── Payment succeeded → ensure active ────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = getInvoiceSubscriptionId(invoice)
        if (!subId) break

        const sub = await stripe.subscriptions.retrieve(subId)
        const orgId = sub.metadata?.organization_id
        if (!orgId) break

        await db.from('subscriptions')
          .update({
            status: 'active',
            current_period_end: getSubPeriodEnd(sub),
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', orgId)

        await db.from('organizations')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', orgId)

        console.log(`[platform/stripe] Payment succeeded for org ${orgId}`)
        break
      }

      // ── Payment failed → mark past_due, send email ────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = getInvoiceSubscriptionId(invoice)
        if (!subId) break

        const sub = await stripe.subscriptions.retrieve(subId)
        const orgId = sub.metadata?.organization_id
        if (!orgId) break

        await db.from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('organization_id', orgId)

        const { data: org } = await db.from('organizations')
          .select('name, slug')
          .eq('id', orgId)
          .single()

        const { data: adminMember } = await db
          .from('org_members')
          .select('user_id')
          .eq('organization_id', orgId)
          .eq('role', 'org_admin')
          .limit(1)
          .single()

        if (adminMember?.user_id && org) {
          const { data: profile } = await db
            .from('profiles')
            .select('email, full_name')
            .eq('id', adminMember.user_id)
            .single()

          if (profile?.email) {
            try {
              const resend = new Resend(process.env.RESEND_API_KEY)
              await resend.emails.send({
                from: FROM_EMAIL,
                to: profile.email,
                subject: `Action required: Payment failed for your Fieldday subscription`,
                html: buildPaymentFailedEmail({
                  name: profile.full_name ?? 'there',
                  orgName: org.name,
                  orgSlug: org.slug,
                }),
              })
              console.log(`[platform/stripe] Payment failed email sent to ${profile.email} for org ${orgId}`)
            } catch (emailErr) {
              console.error('[platform/stripe] Failed to send payment failed email:', emailErr)
            }
          }
        }
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[platform/stripe] Error handling event:', event.type, err)
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ── Email templates ─────────────────────────────────────────────────────────

function buildTrialEndingEmail({
  name,
  orgName,
  orgSlug,
  trialEnd,
}: {
  name: string
  orgName: string
  orgSlug: string
  trialEnd: string
}): string {
  const billingUrl = `https://${orgSlug}.${PLATFORM_DOMAIN}/admin/settings/billing`
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
      <p>Hi ${name},</p>
      <p>Your free trial of <strong>Fieldday</strong> for <strong>${orgName}</strong> ends on <strong>${trialEnd}</strong>.</p>
      <p>To keep your leagues, schedules, and player data, subscribe before your trial expires.</p>
      <p style="margin:28px 0">
        <a href="${billingUrl}" style="background:#f97316;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
          Choose a plan →
        </a>
      </p>
      <p style="color:#666;font-size:13px">
        Questions? Reply to this email and we'll help you out.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
      <p style="color:#999;font-size:12px">
        Fieldday Sports Technology · <a href="https://${PLATFORM_DOMAIN}" style="color:#999">${PLATFORM_DOMAIN}</a>
      </p>
    </div>
  `
}

function buildPaymentFailedEmail({
  name,
  orgName,
  orgSlug,
}: {
  name: string
  orgName: string
  orgSlug: string
}): string {
  const billingUrl = `https://${orgSlug}.${PLATFORM_DOMAIN}/admin/settings/billing`
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
      <p>Hi ${name},</p>
      <p>We weren't able to process payment for your <strong>Fieldday</strong> subscription for <strong>${orgName}</strong>.</p>
      <p>Please update your payment method to keep your account active. We'll retry automatically, but if payment continues to fail your account will become read-only.</p>
      <p style="margin:28px 0">
        <a href="${billingUrl}" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
          Update payment method →
        </a>
      </p>
      <p style="color:#666;font-size:13px">
        If you have any questions, reply to this email and we'll help you out.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
      <p style="color:#999;font-size:12px">
        Fieldday Sports Technology · <a href="https://${PLATFORM_DOMAIN}" style="color:#999">${PLATFORM_DOMAIN}</a>
      </p>
    </div>
  `
}
