import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendRegistrationConfirmation, sendPaymentFailedEmail } from '@/actions/emails'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const { registrationId, userId, orgId, leagueId } = session.metadata ?? {}

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

      const [{ data: profile }, { data: league }] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', userId).single(),
        supabase.from('leagues').select('name').eq('id', leagueId ?? '').single(),
      ])

      const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId ?? '').single()

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

  if (event.type === 'account.updated') {
    const account = event.data.object
    await supabase
      .from('stripe_connect_accounts')
      .update({
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        status: account.charges_enabled ? 'active' : 'pending',
      })
      .eq('stripe_account_id', account.id)
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object
    const registrationId = pi.metadata?.registrationId
    const userId = pi.metadata?.userId
    const leagueId = pi.metadata?.leagueId

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
