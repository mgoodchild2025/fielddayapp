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
  starter: process.env.STRIPE_PRICE_STARTER_MONTHLY,
  pro:     process.env.STRIPE_PRICE_PRO_MONTHLY,
  club:    process.env.STRIPE_PRICE_CLUB_MONTHLY,
}

export type SubscriptionRow = {
  id: string
  organization_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  plan_tier: 'starter' | 'pro' | 'club' | 'internal'
  billing_interval: string | null
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'
  trial_end: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  created_at: string
}

async function requireOrgAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: member } = await supabase
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
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('organization_id', org.id)
    .single()
  return data as SubscriptionRow | null
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
