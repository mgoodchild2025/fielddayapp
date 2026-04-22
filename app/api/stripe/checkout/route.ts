import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPlatformFeeBps } from '@/lib/features'

const schema = z.object({
  leagueId: z.string().uuid(),
  userId: z.string().uuid(),
  registrationId: z.string().uuid(),
  orgId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { leagueId, userId, registrationId, orgId } = parsed.data
  const supabase = createServiceRoleClient()

  const [{ data: league }, { data: connectAccount }, { data: profile }] = await Promise.all([
    supabase.from('leagues').select('name, price_cents, currency').eq('id', leagueId).single(),
    supabase.from('stripe_connect_accounts').select('stripe_account_id').eq('organization_id', orgId).single(),
    supabase.from('profiles').select('email').eq('id', userId).single(),
  ])

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const feeBps = await getPlatformFeeBps(orgId)

  const hasConnectAccount = !!connectAccount?.stripe_account_id

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ['card'],
    mode: 'payment',
    currency: league.currency,
    line_items: [
      {
        price_data: {
          currency: league.currency,
          unit_amount: league.price_cents,
          product_data: { name: league.name },
        },
        quantity: 1,
      },
    ],
    customer_email: profile?.email ?? undefined,
    metadata: { registrationId, leagueId, userId, orgId },
    success_url: `${origin}/register/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/register?step=3`,
    ...(hasConnectAccount && {
      payment_intent_data: {
        transfer_data: { destination: connectAccount!.stripe_account_id },
        ...(feeBps > 0 && { application_fee_amount: Math.round(league.price_cents * feeBps / 10000) }),
        metadata: { registrationId, leagueId, userId, orgId },
      },
    }),
  }

  const session = await stripe.checkout.sessions.create(sessionParams)

  await supabase.from('payments').insert({
    organization_id: orgId,
    registration_id: registrationId,
    user_id: userId,
    league_id: leagueId,
    stripe_checkout_session_id: session.id,
    amount_cents: league.price_cents,
    currency: league.currency,
    status: 'pending',
  })

  return NextResponse.json({ url: session.url })
}
