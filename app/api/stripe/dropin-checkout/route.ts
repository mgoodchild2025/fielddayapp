import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

const schema = z.object({
  orgId: z.string().uuid(),
  leagueId: z.string().uuid(),
  sessionId: z.string().uuid().optional().nullable(),
  guestName: z.string().max(120).optional(),
  guestEmail: z.string().email().optional().or(z.literal('')),
})

/**
 * Creates a Stripe Checkout session for an on-site drop-in walk-up payment (a
 * non-registered guest). The organizer opens the returned URL on a device; the
 * guest pays by card or Apple/Google Pay. The webhook then creates a guest
 * drop-in registration for the session and records the paid payment.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, leagueId, sessionId, guestName, guestEmail } = parsed.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  // Only org/league admins can take a walk-up payment.
  const { data: member } = await db
    .from('org_members').select('role')
    .eq('organization_id', orgId).eq('user_id', user.id).maybeSingle()
  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data: settings } = await db
    .from('org_payment_settings').select('stripe_secret_key').eq('organization_id', orgId).maybeSingle()
  if (!settings?.stripe_secret_key) {
    return NextResponse.json({ error: 'This organization has not connected Stripe.' }, { status: 400 })
  }

  const { data: league } = await db
    .from('leagues').select('id, name, drop_in_price_cents, price_cents, currency, event_type, registration_mode')
    .eq('id', leagueId).eq('organization_id', orgId).maybeSingle()
  if (!league) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  const priceCents = league.drop_in_price_cents ?? league.price_cents ?? 0
  if (priceCents <= 0) {
    return NextResponse.json({ error: 'This event has no drop-in price set.' }, { status: 400 })
  }
  const currency = (league.currency ?? 'cad') as string

  const orgStripe = new Stripe(settings.stripe_secret_key, { apiVersion: '2026-05-27.dahlia' as const, typescript: true })
  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''

  try {
    const checkout = await orgStripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      currency,
      line_items: [{
        price_data: {
          currency,
          unit_amount: priceCents,
          product_data: { name: `${league.name} — drop-in` },
        },
        quantity: 1,
      }],
      customer_email: guestEmail || undefined,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      metadata: {
        paymentType: 'dropin_walkup',
        orgId,
        leagueId,
        sessionId: sessionId || '',
        guestName: guestName || '',
        guestEmail: guestEmail || '',
        addedByAdmin: user.id,
      },
      success_url: `${origin}/admin/events/${leagueId}/sessions?walkup=paid`,
      cancel_url:  `${origin}/admin/events/${leagueId}/sessions?walkup=cancelled`,
    })
    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('[dropin-checkout] Stripe session creation failed:', err)
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
  }
}
