'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getStripe } from '@/lib/stripe'
import { getCurrentOrg } from '@/lib/tenant'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

// Price IDs come from env — set these after creating products in Stripe dashboard
const PRICE_IDS: Record<string, string | undefined> = {
  starter:   process.env.STRIPE_PRICE_STARTER_MONTHLY,
  pro:       process.env.STRIPE_PRICE_PRO_MONTHLY,
  club:      process.env.STRIPE_PRICE_CLUB_MONTHLY,
  hibernate: process.env.STRIPE_PRICE_HIBERNATE_MONTHLY,  // $9/mo data-retention price
}

export type SubscriptionRow = {
  id: string
  organization_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  plan_tier: 'free' | 'starter' | 'pro' | 'club' | 'internal'
  billing_interval: string | null
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | 'hibernating'
  trial_end: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  hibernate_until: string | null
  pre_hibernate_tier: string | null
  created_at: string
}

async function requireOrgAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()
  if (!member || member.role !== 'org_admin') redirect('/admin/dashboard')
  return { org, user }
}

/** Fetch the subscription for the current org. */
export async function getSubscription(): Promise<SubscriptionRow | null> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  const { data } = await db
    .from('subscriptions')
    .select('*')
    .eq('organization_id', org.id)
    .single()
  return data as SubscriptionRow | null
}

/**
 * Switch the org to the free plan.
 * Only allowed when there is no active Stripe subscription (trialing, canceled, or never paid).
 */
export async function switchToFreePlan(): Promise<{ error: string | null }> {
  try {
    const { org } = await requireOrgAdmin()
    const supabase = createServiceRoleClient()

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('organization_id', org.id)
      .single()

    if (sub?.stripe_subscription_id) {
      return { error: 'You have an active Stripe subscription. Cancel it via the billing portal before switching to the free plan.' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('subscriptions')
      .update({
        plan_tier: 'free',
        status: 'active',
        trial_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', org.id)

    return { error: null }
  } catch (err) {
    console.error('[billing] switchToFreePlan error:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Create a Stripe Checkout session for a new subscription.
 * Returns { url } to redirect to, or { error }.
 */
export async function createSubscriptionCheckout(
  tier: 'starter' | 'pro' | 'club'
): Promise<{ url: string } | { error: string }> {
  try {
    const { org, user } = await requireOrgAdmin()
    const priceId = PRICE_IDS[tier]
    if (!priceId) {
      return { error: `Price ID for "${tier}" plan is not configured. Please contact support.` }
    }

    const stripe = getStripe()
    const supabase = createServiceRoleClient()

    // Get or create a Stripe customer for this org
    let customerId: string | null = null
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', org.id)
      .single()

    customerId = sub?.stripe_customer_id ?? null

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { organization_id: org.id, org_slug: org.slug },
        email: user.email,
      })
      customerId = customer.id
      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('organization_id', org.id)
    }

    const orgBase = `https://${org.slug}.${PLATFORM_DOMAIN}`

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { organization_id: org.id, org_slug: org.slug, plan_tier: tier },
      },
      metadata: { organization_id: org.id, plan_tier: tier },
      success_url: `${orgBase}/admin/settings/billing?success=1`,
      cancel_url: `${orgBase}/admin/settings/billing?canceled=1`,
    })

    if (!session.url) return { error: 'Failed to create checkout session.' }
    return { url: session.url }
  } catch (err) {
    console.error('[billing] createSubscriptionCheckout error:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Create a Stripe Customer Portal session so org admins can manage
 * their subscription (upgrade, downgrade, cancel, update payment method).
 */
export async function createCustomerPortalSession(): Promise<{ url: string } | { error: string }> {
  try {
    const { org } = await requireOrgAdmin()
    const supabase = createServiceRoleClient()

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', org.id)
      .single()

    if (!sub?.stripe_customer_id) {
      return { error: 'No billing account found. Please subscribe first.' }
    }

    const stripe = getStripe()
    const orgBase = `https://${org.slug}.${PLATFORM_DOMAIN}`

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${orgBase}/admin/settings/billing`,
    })

    return { url: session.url }
  } catch (err) {
    console.error('[billing] createCustomerPortalSession error:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Hibernate the org's subscription.
 * Switches the Stripe subscription to the $9/mo hibernate price,
 * sets status = 'hibernating', stores the original tier for later restoration,
 * and optionally sets a date when the subscription auto-resumes.
 *
 * resumeAt: ISO date string (YYYY-MM-DD) or null for manual resume only.
 */
export async function hibernateSubscription(
  resumeAt: string | null
): Promise<{ error: string | null }> {
  try {
    const { org } = await requireOrgAdmin()
    const supabase = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sub } = await (supabase as any)
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_customer_id, plan_tier, status')
      .eq('organization_id', org.id)
      .single() as { data: { stripe_subscription_id: string | null; stripe_customer_id: string | null; plan_tier: string; status: string } | null }

    if (!sub) return { error: 'Subscription not found.' }
    if (sub.status === 'hibernating') return { error: 'Subscription is already hibernating.' }
    if (sub.status !== 'active') return { error: 'Only active subscriptions can be hibernated.' }
    if (sub.plan_tier === 'free') return { error: 'Free plans cannot be hibernated — they are already free.' }

    const hibernateUntil = resumeAt ? new Date(resumeAt).toISOString() : null

    // If there's a Stripe subscription, switch to the hibernate price
    if (sub.stripe_subscription_id && PRICE_IDS.hibernate) {
      const stripe = getStripe()
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      const currentItemId = stripeSub.items.data[0]?.id

      if (currentItemId) {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          items: [{ id: currentItemId, price: PRICE_IDS.hibernate }],
          proration_behavior: 'always_invoice',
          metadata: { hibernating: 'true', original_tier: sub.plan_tier },
        })
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('subscriptions')
      .update({
        status: 'hibernating',
        pre_hibernate_tier: sub.plan_tier,
        hibernate_until: hibernateUntil,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', org.id)

    return { error: null }
  } catch (err) {
    console.error('[billing] hibernateSubscription error:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Resume a hibernating subscription immediately.
 * Switches the Stripe subscription back to the original tier price.
 */
export async function resumeFromHibernation(): Promise<{ error: string | null }> {
  try {
    const { org } = await requireOrgAdmin()
    const supabase = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sub } = await (supabase as any)
      .from('subscriptions')
      .select('stripe_subscription_id, pre_hibernate_tier, status')
      .eq('organization_id', org.id)
      .single() as { data: { stripe_subscription_id: string | null; pre_hibernate_tier: string | null; status: string } | null }

    if (!sub) return { error: 'Subscription not found.' }
    if (sub.status !== 'hibernating') return { error: 'Subscription is not currently hibernating.' }

    const restoreTier = (sub.pre_hibernate_tier ?? 'starter') as 'starter' | 'pro' | 'club'
    const restorePriceId = PRICE_IDS[restoreTier]

    if (sub.stripe_subscription_id && restorePriceId) {
      const stripe = getStripe()
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      const currentItemId = stripeSub.items.data[0]?.id

      if (currentItemId) {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          items: [{ id: currentItemId, price: restorePriceId }],
          proration_behavior: 'always_invoice',
          metadata: { hibernating: 'false', original_tier: '' },
        })
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('subscriptions')
      .update({
        status: 'active',
        plan_tier: restoreTier,
        pre_hibernate_tier: null,
        hibernate_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', org.id)

    return { error: null }
  } catch (err) {
    console.error('[billing] resumeFromHibernation error:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}
