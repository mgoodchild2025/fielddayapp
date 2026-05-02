import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'

const playerSchema = z.object({
  leagueId: z.string().uuid(),
  leagueSlug: z.string(),
  userId: z.string().uuid(),
  registrationId: z.string().uuid(),
  orgId: z.string().uuid(),
})

const teamSchema = z.object({
  leagueId: z.string().uuid(),
  leagueSlug: z.string(),
  teamId: z.string().uuid(),
  orgId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const db = createServiceRoleClient()

  // ── Team payment ──────────────────────────────────────────────────────────
  const teamParsed = teamSchema.safeParse(body)
  if (teamParsed.success && 'teamId' in body && !('registrationId' in body)) {
    const { leagueId, leagueSlug, teamId, orgId } = teamParsed.data

    const [{ data: league }, { data: team }, { data: paymentSettings }] = await Promise.all([
      db.from('leagues').select('name, price_cents, currency, max_teams').eq('id', leagueId).single(),
      db.from('teams').select('name').eq('id', teamId).single(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('org_payment_settings').select('stripe_secret_key').eq('organization_id', orgId).single(),
    ])

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    if (!paymentSettings?.stripe_secret_key) {
      return NextResponse.json(
        { error: 'This organization has not configured online payments. Please contact the organizer.' },
        { status: 422 }
      )
    }

    // ── Capacity guard: prevent payment if event is now full ─────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maxTeams = (league as any).max_teams as number | null
    if (maxTeams) {
      const { count: teamCount } = await db
        .from('teams')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', leagueId)
        .eq('organization_id', orgId)
        .eq('status', 'active')
      if ((teamCount ?? 0) > maxTeams) {
        return NextResponse.json({ error: 'This event is full — no more team spots available.' }, { status: 409 })
      }
    }

    // Prevent duplicate payment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from('payments')
      .select('id, status')
      .eq('team_id', teamId)
      .eq('league_id', leagueId)
      .eq('payment_type', 'team')
      .maybeSingle()

    if (existing?.status === 'paid') {
      return NextResponse.json({ error: 'This team has already paid.' }, { status: 409 })
    }

    const orgStripe = new Stripe(paymentSettings.stripe_secret_key, {
      apiVersion: '2026-04-22.dahlia' as const,
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
            product_data: { name: `${league.name} — ${team.name} (Team)` },
          },
          quantity: 1,
        },
      ],
      metadata: { teamId, leagueId, orgId, paymentType: 'team' },
      success_url: `${origin}/teams/${teamId}?payment=success`,
      cancel_url: `${origin}/teams/${teamId}`,
    })

    // Upsert — if a pending payment already exists, replace it
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('payments')
        .update({
          stripe_checkout_session_id: session.id,
          amount_cents: league.price_cents,
          status: 'pending',
        })
        .eq('id', existing.id)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('payments')
        .insert({
          organization_id: orgId,
          team_id: teamId,
          league_id: leagueId,
          stripe_checkout_session_id: session.id,
          amount_cents: league.price_cents,
          currency: league.currency,
          status: 'pending',
          payment_type: 'team',
        })
    }

    return NextResponse.json({ url: session.url })
  }

  // ── Per-player payment (existing flow) ───────────────────────────────────
  const parsed = playerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { leagueId, leagueSlug, userId, registrationId, orgId } = parsed.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db2 = db as any
  const [{ data: league }, { data: paymentSettings }, { data: profile }, { data: registration }] = await Promise.all([
    db2.from('leagues').select('name, price_cents, currency, drop_in_price_cents, max_participants, payment_mode').eq('id', leagueId).single(),
    db2.from('org_payment_settings').select('stripe_secret_key').eq('organization_id', orgId).single(),
    db2.from('profiles').select('email').eq('id', userId).single(),
    db2.from('registrations').select('registration_type').eq('id', registrationId).single(),
  ])

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })

  // ── Capacity guard: per-player events ────────────────────────────────────
  if (league.payment_mode !== 'per_team' && league.max_participants) {
    const { count: regCount } = await db
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('organization_id', orgId)
      .in('status', ['pending', 'active'])
    if ((regCount ?? 0) > league.max_participants) {
      return NextResponse.json({ error: 'This event is full — no more spots available.' }, { status: 409 })
    }
  }

  const isDropIn = registration?.registration_type === 'drop_in'
  const priceCents = isDropIn ? (league.drop_in_price_cents ?? league.price_cents) : league.price_cents

  if (!paymentSettings?.stripe_secret_key) {
    return NextResponse.json(
      { error: 'This organization has not configured online payments. Please pay at registration or contact the organizer.' },
      { status: 422 }
    )
  }

  const orgStripe = new Stripe(paymentSettings.stripe_secret_key, {
    apiVersion: '2026-04-22.dahlia' as const,
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
          unit_amount: priceCents,
          product_data: {
            name: isDropIn ? `${league.name} — Drop-in` : league.name,
          },
        },
        quantity: 1,
      },
    ],
    customer_email: profile?.email ?? undefined,
    metadata: { registrationId, leagueId, userId, orgId, paymentType: 'player' },
    success_url: `${origin}/register/${leagueSlug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/register/${leagueSlug}`,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('payments').insert({
    organization_id: orgId,
    registration_id: registrationId,
    user_id: userId,
    league_id: leagueId,
    stripe_checkout_session_id: session.id,
    amount_cents: priceCents,
    currency: league.currency,
    status: 'pending',
    payment_type: 'player',
  })

  return NextResponse.json({ url: session.url })
}
