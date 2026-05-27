/**
 * GET /api/cron/hibernate-resume
 *
 * Auto-resumes hibernating subscriptions when their hibernate_until date
 * has passed. Switches the Stripe subscription back to the original tier
 * price and marks the subscription as active.
 *
 * Run this daily (e.g. 6 AM UTC via Vercel / Railway cron).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getStripe } from '@/lib/stripe'

const PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER_MONTHLY,
  pro:     process.env.STRIPE_PRICE_PRO_MONTHLY,
  club:    process.env.STRIPE_PRICE_CLUB_MONTHLY,
}

type SubRow = {
  organization_id: string
  stripe_subscription_id: string | null
  pre_hibernate_tier: string | null
}

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServiceRoleClient()
    const now = new Date().toISOString()
    const results: string[] = []

    // Find all subscriptions that are hibernating and past their resume date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: toResume } = await (db as any)
      .from('subscriptions')
      .select('organization_id, stripe_subscription_id, pre_hibernate_tier')
      .eq('status', 'hibernating')
      .not('hibernate_until', 'is', null)
      .lte('hibernate_until', now) as { data: SubRow[] | null }

    if (!toResume?.length) {
      return NextResponse.json({ resumed: 0, results: ['No subscriptions to resume.'] })
    }

    const stripe = getStripe()

    for (const sub of toResume) {
      try {
        const restoreTier = (sub.pre_hibernate_tier ?? 'starter') as 'starter' | 'pro' | 'club'
        const restorePriceId = PRICE_IDS[restoreTier]

        // Switch Stripe subscription back to original tier price
        if (sub.stripe_subscription_id && restorePriceId) {
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

        // Update DB
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from('subscriptions')
          .update({
            status: 'active',
            plan_tier: restoreTier,
            pre_hibernate_tier: null,
            hibernate_until: null,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', sub.organization_id)

        results.push(`✓ Resumed ${sub.organization_id} → ${restoreTier}`)
      } catch (err) {
        results.push(`✗ Failed to resume ${sub.organization_id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({ resumed: toResume.length, results })
  } catch (err) {
    console.error('[cron/hibernate-resume] error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
