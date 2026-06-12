import Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { platformEnvFor } from '@/lib/stripe-platform'

const API_VERSION = '2026-05-27.dahlia' as const

function periodEndIso(sub: Stripe.Subscription): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemEnd = (sub.items?.data?.[0] as any)?.current_period_end as number | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootEnd = (sub as any).current_period_end as number | undefined
  const end = itemEnd ?? rootEnd
  return end ? new Date(end * 1000).toISOString() : null
}

/**
 * Called when a platform subscription is deleted in Stripe (e.g. a scheduled
 * downgrade reached its period end). If the org had a PENDING downgrade to a
 * lower PAID tier, re-subscribe them at that tier; otherwise drop them to Free.
 * Reuses the customer's existing default payment method.
 */
export async function applySubscriptionDeletion(
  subscription: Stripe.Subscription,
  mode: 'test' | 'live'
): Promise<{ result: 'resubscribed' | 'free'; tier: string }> {
  const db = createServiceRoleClient()
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

  // Locate our subscription row (by customer id, falling back to org metadata).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let row: any = null
  if (customerId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (db as any)
      .from('subscriptions')
      .select('organization_id, plan_tier, pending_plan_tier')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    row = r.data
  }
  if (!row && subscription.metadata?.organization_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (db as any)
      .from('subscriptions')
      .select('organization_id, plan_tier, pending_plan_tier')
      .eq('organization_id', subscription.metadata.organization_id)
      .maybeSingle()
    row = r.data
  }
  if (!row) return { result: 'free', tier: 'free' }

  const orgId = row.organization_id as string
  const pending = row.pending_plan_tier as string | null
  const env = platformEnvFor(mode)

  // Re-subscribe at a pending lower PAID tier.
  if (pending && pending !== 'free' && customerId && env.secretKey) {
    const newPrice = (env.prices as Record<string, string | undefined>)[pending]
    if (newPrice) {
      try {
        const stripe = new Stripe(env.secretKey, { apiVersion: API_VERSION })
        const pm =
          typeof subscription.default_payment_method === 'string'
            ? subscription.default_payment_method
            : subscription.default_payment_method?.id
        const newSub = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: newPrice }],
          ...(pm ? { default_payment_method: pm } : {}),
          metadata: { organization_id: orgId, plan_tier: pending },
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('subscriptions')
          .update({
            plan_tier: pending,
            status: 'active',
            stripe_subscription_id: newSub.id,
            current_period_end: periodEndIso(newSub),
            cancel_at_period_end: false,
            pending_plan_tier: null,
            pending_plan_effective: null,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', orgId)
        return { result: 'resubscribed', tier: pending }
      } catch (err) {
        console.error('[billing-downgrade] re-subscribe failed, dropping to free:', err)
        // fall through to free
      }
    }
  }

  // Default: drop to Free and clear Stripe ids.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('subscriptions')
    .update({
      status: 'active',
      plan_tier: 'free',
      stripe_subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
      pending_plan_tier: null,
      pending_plan_effective: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId)
  return { result: 'free', tier: 'free' }
}
