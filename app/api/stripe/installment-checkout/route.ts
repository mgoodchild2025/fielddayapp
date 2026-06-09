import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'

const schema = z.object({
  installmentId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { installmentId } = parsed.data
  const db = createServiceRoleClient()

  // ── Fetch installment + enrollment + registration + league ─────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: installment } = await (db as any)
    .from('payment_plan_installments')
    .select(`
      id, installment_number, amount_cents, status, stripe_checkout_session_id,
      organization_id,
      enrollment:payment_plan_enrollments!inner(
        id, total_cents, status,
        registration:registrations!inner(
          id, user_id, league_id,
          league:leagues!inner(id, name, slug, currency)
        )
      )
    `)
    .eq('id', installmentId)
    .single()

  if (!installment) {
    return NextResponse.json({ error: 'Instalment not found' }, { status: 404 })
  }

  const enrollment  = Array.isArray(installment.enrollment) ? installment.enrollment[0] : installment.enrollment
  const registration = Array.isArray(enrollment?.registration) ? enrollment.registration[0] : enrollment?.registration
  const league       = Array.isArray(registration?.league)      ? registration.league[0]      : registration?.league

  if (!registration || !league || !enrollment) {
    return NextResponse.json({ error: 'Instalment data incomplete' }, { status: 500 })
  }

  // ── Ownership check ────────────────────────────────────────────────────────
  if (registration.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  // ── Status checks ──────────────────────────────────────────────────────────
  if (installment.status !== 'pending') {
    return NextResponse.json({ error: 'Instalment is not pending' }, { status: 400 })
  }
  if (enrollment.status === 'cancelled') {
    return NextResponse.json({ error: 'Payment plan has been cancelled' }, { status: 400 })
  }

  // ── Dedup: return existing session if one was already created ──────────────
  if (installment.stripe_checkout_session_id) {
    // Check the session is still open before reusing it
    const orgSettings = await (db as any)
      .from('org_payment_settings')
      .select('stripe_secret_key')
      .eq('organization_id', installment.organization_id)
      .single()
    if (orgSettings.data?.stripe_secret_key) {
      const orgStripe = new Stripe(orgSettings.data.stripe_secret_key, { apiVersion: '2025-02-24.acacia' })
      try {
        const existing = await orgStripe.checkout.sessions.retrieve(installment.stripe_checkout_session_id)
        if (existing.status === 'open') {
          return NextResponse.json({ url: existing.url })
        }
      } catch {
        // Session expired — fall through to create a new one
      }
    }
  }

  // ── Feature gate ───────────────────────────────────────────────────────────
  const hasPlans = await canAccess(installment.organization_id, 'payment_plans')
  if (!hasPlans) {
    return NextResponse.json({ error: 'Payment plans are not available on this plan' }, { status: 403 })
  }

  // ── Load org Stripe key ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: paymentSettings } = await (db as any)
    .from('org_payment_settings')
    .select('stripe_secret_key')
    .eq('organization_id', installment.organization_id)
    .single()

  if (!paymentSettings?.stripe_secret_key) {
    return NextResponse.json({ error: 'Stripe is not configured for this organisation' }, { status: 400 })
  }

  const orgStripe = new Stripe(paymentSettings.stripe_secret_key, { apiVersion: '2025-02-24.acacia' })

  // Total instalment count for the display label
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: totalInstCount } = await (db as any)
    .from('payment_plan_installments')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollment.id)

  const currency  = (league.currency ?? 'cad').toLowerCase()
  const origin    = req.headers.get('origin') ?? 'https://fielddayapp.ca'

  // ── Create Stripe Checkout session ────────────────────────────────────────
  const session = await orgStripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    currency,
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: installment.amount_cents,
          product_data: {
            name: `Instalment ${installment.installment_number} of ${totalInstCount ?? '?'} — ${league.name}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      paymentType: 'installment',
      installmentId,
      enrollmentId: enrollment.id,
      registrationId: registration.id,
      orgId: installment.organization_id,
      userId: user.id,
      installmentNumber: String(installment.installment_number),
    },
    payment_intent_data: {
      metadata: {
        paymentType: 'installment',
        installmentId,
        enrollmentId: enrollment.id,
        registrationId: registration.id,
        orgId: installment.organization_id,
        userId: user.id,
        installmentNumber: String(installment.installment_number),
      },
    },
    success_url: `${origin}/events/${league.slug}?installment=success`,
    cancel_url: `${origin}/events/${league.slug}`,
  })

  // ── Save session ID on installment (dedup guard) ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('payment_plan_installments')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', installmentId)

  return NextResponse.json({ url: session.url })
}
