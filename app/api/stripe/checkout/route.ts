import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'

const schema = z.object({
  leagueId: z.string().uuid(),
  leagueSlug: z.string(),
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

  const { leagueId, leagueSlug, userId, registrationId, orgId } = parsed.data
  const supabase = createServiceRoleClient()

  const [{ data: league }, { data: paymentSettings }, { data: profile }] = await Promise.all([
    supabase.from('leagues').select('name, price_cents, currency').eq('id', leagueId).single(),
    supabase.from('org_payment_settings').select('stripe_secret_key').eq('organization_id', orgId).single(),
    supabase.from('profiles').select('email').eq('id', userId).single(),
  ])

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })

  if (!paymentSettings?.stripe_secret_key) {
    return NextResponse.json(
      { error: 'This organization has not configured online payments. Please pay at registration or contact the organizer.' },
      { status: 422 }
    )
  }

  const orgStripe = new Stripe(paymentSettings.stripe_secret_key, {
    apiVersion: '2026-03-25.dahlia' as const,
    typescript: true,
  })

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''

  const session = await orgStripe.checkout.sessions.create({
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
    success_url: `${origin}/register/${leagueSlug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/register/${leagueSlug}`,
  })

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
