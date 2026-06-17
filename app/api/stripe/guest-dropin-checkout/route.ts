import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { getCurrentOrg } from '@/lib/tenant'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createRateLimiter } from '@/lib/rate-limit'

const limiter = createRateLimiter({ windowMs: 10 * 60_000, max: 8 })

const schema = z.object({
  registrationId: z.string().uuid(),
})

/**
 * Public Stripe Checkout for a guest (no-account) self-serve drop-in payment.
 * The pending guest registration is created first by `registerGuestDropin`; this
 * route charges for it. On success the webhook (`guest_dropin`) — or the
 * return-fallback on the guest success page — marks the payment paid and the
 * registration active.
 */
export async function POST(request: NextRequest) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() ?? headersList.get('x-real-ip') ?? 'unknown'
  if (limiter.check(ip).limited) return NextResponse.json({ error: 'Too many requests. Please wait a few minutes.' }, { status: 429 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  // Load the pending guest registration (authoritative — we never trust a client price).
  const { data: reg } = await db
    .from('registrations')
    .select('id, league_id, status, user_id, guest_name, guest_email')
    .eq('id', parsed.data.registrationId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!reg) return NextResponse.json({ error: 'Registration not found.' }, { status: 404 })
  if (reg.status !== 'pending') return NextResponse.json({ error: 'This registration is not awaiting payment.' }, { status: 400 })

  const { data: settings } = await db
    .from('org_payment_settings').select('stripe_secret_key').eq('organization_id', org.id).maybeSingle()
  if (!settings?.stripe_secret_key) {
    return NextResponse.json({ error: 'This organization has not connected Stripe.' }, { status: 400 })
  }

  const { data: league } = await db
    .from('leagues').select('id, name, slug, drop_in_price_cents, price_cents, currency')
    .eq('id', reg.league_id).eq('organization_id', org.id).maybeSingle()
  if (!league) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  const priceCents = league.drop_in_price_cents ?? league.price_cents ?? 0
  if (priceCents <= 0) return NextResponse.json({ error: 'This event has no drop-in price set.' }, { status: 400 })
  const currency = (league.currency ?? 'cad') as string

  // Reuse an existing pending payment row for this registration if present, else create one.
  let paymentId: string | null = null
  const { data: existingPay } = await db
    .from('payments').select('id').eq('registration_id', reg.id).eq('status', 'pending').limit(1).maybeSingle()
  if (existingPay) {
    paymentId = existingPay.id
  } else {
    const { data: pay } = await db.from('payments').insert({
      organization_id: org.id,
      registration_id: reg.id,
      user_id: reg.user_id ?? null,
      league_id: league.id,
      payment_type: 'player',
      amount_cents: priceCents,
      currency,
      status: 'pending',
      payment_method: 'stripe',
    }).select('id').single()
    paymentId = pay?.id ?? null
  }

  const orgStripe = new Stripe(settings.stripe_secret_key, { apiVersion: '2026-05-27.dahlia' as const, typescript: true })
  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''

  try {
    const checkout = await orgStripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      currency,
      line_items: [{
        price_data: { currency, unit_amount: priceCents, product_data: { name: `${league.name} — drop-in` } },
        quantity: 1,
      }],
      customer_email: reg.guest_email || undefined,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      metadata: {
        paymentType: 'guest_dropin',
        orgId: org.id,
        leagueId: league.id,
        registrationId: reg.id,
        paymentId: paymentId ?? '',
      },
      success_url: `${origin}/register/${league.slug}/guest-success?reg=${reg.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/register/${league.slug}?mode=drop_in`,
    })

    if (paymentId) {
      await db.from('payments').update({ stripe_checkout_session_id: checkout.id }).eq('id', paymentId)
    }
    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('[guest-dropin-checkout] Stripe session creation failed:', err)
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
  }
}
