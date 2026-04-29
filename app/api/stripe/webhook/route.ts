import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendRegistrationConfirmation, sendPaymentFailedEmail } from '@/actions/emails'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  // Org is identified by the subdomain — the proxy injects x-org-id on every request
  const orgId = request.headers.get('x-org-id')
  if (!orgId) return NextResponse.json({ error: 'Unknown org' }, { status: 400 })

  const supabase = createServiceRoleClient()

  const { data: paymentSettings } = await supabase
    .from('org_payment_settings')
    .select('stripe_secret_key, stripe_webhook_secret')
    .eq('organization_id', orgId)
    .single()

  if (!paymentSettings?.stripe_webhook_secret) {
    // No webhook secret configured — acknowledge receipt but skip processing
    console.warn(`[webhook] org ${orgId} has no webhook secret configured`)
    return NextResponse.json({ received: true })
  }

  // Verify signature with the org's own webhook secret
  let event: Stripe.Event
  try {
    // constructEvent doesn't make API calls, so any Stripe instance works for verification
    const stripe = new Stripe(paymentSettings.stripe_secret_key ?? 'sk_placeholder', {
      apiVersion: '2026-03-25.dahlia' as const,
    })
    event = stripe.webhooks.constructEvent(body, sig, paymentSettings.stripe_webhook_secret)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { registrationId, userId, leagueId } = session.metadata ?? {}

    if (registrationId && userId) {
      await Promise.all([
        supabase
          .from('payments')
          .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: session.payment_intent as string })
          .eq('stripe_checkout_session_id', session.id),
        supabase
          .from('registrations')
          .update({ status: 'active' })
          .eq('id', registrationId),
      ])

      const [{ data: profile }, { data: league }, { data: org }] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', userId).single(),
        supabase.from('leagues').select('name').eq('id', leagueId ?? '').single(),
        supabase.from('organizations').select('name').eq('id', orgId).single(),
      ])

      if (profile?.email && league?.name) {
        await sendRegistrationConfirmation({
          email: profile.email,
          name: profile.full_name,
          leagueName: league.name,
          orgName: org?.name ?? '',
        })
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent
    const { registrationId, userId, leagueId } = pi.metadata ?? {}

    if (registrationId) {
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', pi.id)
    }

    if (userId && leagueId) {
      const [{ data: profile }, { data: league }] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', userId).single(),
        supabase.from('leagues').select('name').eq('id', leagueId).single(),
      ])

      if (profile?.email && league?.name) {
        await sendPaymentFailedEmail({ email: profile.email, name: profile.full_name, leagueName: league.name })
      }
    }
  }

  return NextResponse.json({ received: true })
}
