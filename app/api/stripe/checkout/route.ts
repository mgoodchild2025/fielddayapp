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
  discountId: z.string().uuid().optional(),   // validated discount code id
  merchSelections: z.array(z.object({
    itemId: z.string().uuid(),
    variantId: z.string().uuid().nullable(),
    quantity: z.number().int().positive(),
  })).optional().default([]),
})

const teamSchema = z.object({
  leagueId: z.string().uuid(),
  leagueSlug: z.string(),
  teamId: z.string().uuid(),
  orgId: z.string().uuid(),
  discountId: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const db = createServiceRoleClient()

  // ── Team payment ──────────────────────────────────────────────────────────
  const teamParsed = teamSchema.safeParse(body)
  if (teamParsed.success && 'teamId' in body && !('registrationId' in body)) {
    const { leagueId, leagueSlug, teamId, orgId, discountId: teamDiscountId } = teamParsed.data

    const [{ data: league }, { data: team }, { data: paymentSettings }] = await Promise.all([
      db.from('leagues').select('name, price_cents, currency, max_teams').eq('id', leagueId).single(),
      db.from('teams').select('name').eq('id', teamId).single(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('org_payment_settings').select('stripe_secret_key, registration_payment_mode, registration_manual_instructions').eq('organization_id', orgId).single(),
    ])

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    // Apply discount server-side
    let teamPriceCents: number = league.price_cents
    let teamDiscountApplied: { id: string } | null = null
    if (teamDiscountId && teamPriceCents > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dr } = await (db as any)
        .from('discount_codes')
        .select('id, type, value, active, expires_at, max_uses, use_count, applies_to')
        .eq('id', teamDiscountId).eq('organization_id', orgId).single()
      if (
        dr && dr.active &&
        (!dr.expires_at || new Date(dr.expires_at) > new Date()) &&
        (!dr.max_uses || dr.use_count < dr.max_uses) &&
        (dr.applies_to === 'all' || dr.applies_to === 'leagues')
      ) {
        const reduction = dr.type === 'percent'
          ? Math.round(teamPriceCents * dr.value / 100)
          : Math.min(dr.value * 100, teamPriceCents)
        teamPriceCents = Math.max(0, teamPriceCents - reduction)
        teamDiscountApplied = { id: dr.id }
      }
    }

    // ── Manual payment mode — skip Stripe entirely ───────────────────────────
    const isManual = paymentSettings?.registration_payment_mode === 'manual' || !paymentSettings?.stripe_secret_key
    if (isManual) {
      const instructions = paymentSettings?.registration_manual_instructions ?? null
      if (teamDiscountApplied) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).rpc('increment_discount_use', { discount_id: teamDiscountApplied.id })
      }
      return NextResponse.json({ manual: true, instructions })
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
            unit_amount: teamPriceCents,
            product_data: { name: `${league.name} — ${team.name} (Team)` },
          },
          quantity: 1,
        },
      ],
      metadata: { teamId, leagueId, orgId, paymentType: 'team' },
      payment_intent_data: {
        metadata: { teamId, leagueId, orgId, paymentType: 'team' },
      },
      success_url: `${origin}/teams/${teamId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/teams/${teamId}`,
    })

    // Upsert — if a pending payment already exists, replace it
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('payments')
        .update({
          stripe_checkout_session_id: session.id,
          amount_cents: teamPriceCents,
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
          amount_cents: teamPriceCents,
          currency: league.currency,
          status: 'pending',
          payment_type: 'team',
        })
    }

    if (teamDiscountApplied) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).rpc('increment_discount_use', { discount_id: teamDiscountApplied.id })
    }

    return NextResponse.json({ url: session.url })
  }

  // ── Per-player payment (existing flow) ───────────────────────────────────
  const parsed = playerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { leagueId, leagueSlug, userId, registrationId, orgId, discountId, merchSelections } = parsed.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db2 = db as any
  const [{ data: league }, { data: paymentSettings }, { data: profile }, { data: registration }] = await Promise.all([
    db2.from('leagues').select('name, price_cents, currency, drop_in_price_cents, max_participants, payment_mode, early_bird_price_cents, early_bird_deadline').eq('id', leagueId).single(),
    db2.from('org_payment_settings').select('stripe_secret_key, registration_payment_mode, registration_manual_instructions').eq('organization_id', orgId).maybeSingle(),
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
  const earlyBirdActive = !isDropIn && league.early_bird_price_cents != null && league.early_bird_deadline != null && new Date() < new Date(league.early_bird_deadline)
  let priceCents: number = isDropIn
    ? (league.drop_in_price_cents ?? league.price_cents)
    : (earlyBirdActive ? league.early_bird_price_cents : league.price_cents)

  // Apply discount server-side (re-validate to prevent price tampering)
  let discountApplied: { id: string; type: string; value: number } | null = null
  if (discountId && priceCents > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: discountRow } = await (db2 as any)
      .from('discount_codes')
      .select('id, type, value, active, expires_at, max_uses, use_count, applies_to')
      .eq('id', discountId)
      .eq('organization_id', orgId)
      .single()
    if (
      discountRow && discountRow.active &&
      (!discountRow.expires_at || new Date(discountRow.expires_at) > new Date()) &&
      (!discountRow.max_uses || discountRow.use_count < discountRow.max_uses) &&
      (discountRow.applies_to === 'all' || discountRow.applies_to === (isDropIn ? 'dropins' : 'leagues'))
    ) {
      const reduction = discountRow.type === 'percent'
        ? Math.round(priceCents * discountRow.value / 100)
        : Math.min(discountRow.value * 100, priceCents)
      priceCents = Math.max(0, priceCents - reduction)
      discountApplied = { id: discountRow.id, type: discountRow.type, value: discountRow.value }
    }
  }

  // Manual payment mode — skip Stripe entirely and return instructions to the client
  const isManualRegistration =
    paymentSettings?.registration_payment_mode === 'manual' || !paymentSettings?.stripe_secret_key
  if (isManualRegistration) {
    const instructions = paymentSettings?.registration_manual_instructions ?? null
    // Mark registration as active and record that payment instructions were shown.
    // The 'manual' payment record lets the resume logic detect the captain/player
    // already acknowledged payment — preventing the payment step from re-appearing.
    // Only insert if no completed payment record exists yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingCompletedPayment } = await (db as any)
      .from('payments')
      .select('id')
      .eq('registration_id', registrationId)
      .in('status', ['paid', 'manual'])
      .limit(1)
      .maybeSingle()

    await Promise.all([
      db.from('registrations').update({ status: 'active' }).eq('id', registrationId),
      ...(!existingCompletedPayment ? [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from('payments').insert({
          organization_id: orgId,
          registration_id: registrationId,
          user_id: userId,
          league_id: leagueId,
          amount_cents: priceCents,
          currency: league.currency,
          status: 'manual',
          payment_method: 'cash',
          payment_type: 'player',
        }),
      ] : []),
    ])
    if (discountApplied) {
      await db2.rpc('increment_discount_use', { discount_id: discountApplied.id })
    }
    return NextResponse.json({ manual: true, instructions })
  }

  // ── Merchandise: validate server-side prices and create pending orders ──────
  type MerchItemRow = { id: string; price_cents: number; name: string; is_active: boolean }
  type MerchVariantRow = { id: string; item_id: string; label: string; stock_quantity: number | null }
  type LeagueMerchRow = { item_id: string; price_override_cents: number | null }

  let merchOrderIds: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merch_line_items: any[] = []

  if (merchSelections.length > 0) {
    const itemIds = [...new Set(merchSelections.map((s) => s.itemId))]
    const variantIds = merchSelections.map((s) => s.variantId).filter(Boolean) as string[]

    const [{ data: merchItems }, { data: merchVariants }, { data: leagueMerchRows }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('merchandise_items').select('id, price_cents, name, is_active').in('id', itemIds),
      variantIds.length > 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (db as any).from('merchandise_variants').select('id, item_id, label, stock_quantity').in('id', variantIds)
        : Promise.resolve({ data: [] }),
      // Fetch price overrides for this league
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('league_merchandise')
        .select('item_id, price_override_cents')
        .eq('league_id', leagueId)
        .in('item_id', itemIds),
    ])

    const itemMap = new Map<string, MerchItemRow>()
    for (const i of (merchItems ?? []) as MerchItemRow[]) itemMap.set(i.id, i)

    const variantMap = new Map<string, MerchVariantRow>()
    for (const v of (merchVariants ?? []) as MerchVariantRow[]) variantMap.set(v.id, v)

    // Map item_id → effective price (override if set, else base)
    const effectivePriceMap = new Map<string, number>()
    for (const row of (leagueMerchRows ?? []) as LeagueMerchRow[]) {
      const base = itemMap.get(row.item_id)?.price_cents ?? 0
      effectivePriceMap.set(row.item_id, row.price_override_cents ?? base)
    }

    const orderRows: {
      organization_id: string
      league_id: string
      registration_id: string
      user_id: string
      item_id: string
      variant_id: string | null
      quantity: number
      unit_price_cents: number
      status: string
    }[] = []

    for (const sel of merchSelections) {
      const item = itemMap.get(sel.itemId)
      if (!item || !item.is_active) continue

      const variant = sel.variantId ? variantMap.get(sel.variantId) : null
      if (sel.variantId && !variant) continue

      // Use server-side effective price (override ?? base); never trust client-sent price
      const effectivePrice = effectivePriceMap.get(item.id) ?? item.price_cents

      orderRows.push({
        organization_id: orgId,
        league_id: leagueId,
        registration_id: registrationId,
        user_id: userId,
        item_id: item.id,
        variant_id: sel.variantId ?? null,
        quantity: sel.quantity,
        unit_price_cents: effectivePrice,
        status: 'pending',
      })

      const itemLabel = variant ? `${item.name} — ${variant.label}` : item.name
      merch_line_items.push({
        price_data: {
          currency: league.currency,
          unit_amount: effectivePrice,
          product_data: { name: itemLabel },
        },
        quantity: sel.quantity,
      })
    }

    if (orderRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: insertedOrders } = await (db as any)
        .from('merchandise_orders')
        .insert(orderRows)
        .select('id')
      merchOrderIds = ((insertedOrders ?? []) as { id: string }[]).map((r) => r.id)
    }
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
      ...(priceCents > 0 ? [{
        price_data: {
          currency: league.currency,
          unit_amount: priceCents,
          product_data: {
            name: isDropIn ? `${league.name} — Drop-in` : earlyBirdActive ? `${league.name} — Early Bird` : league.name,
          },
        },
        quantity: 1,
      }] : []),
      ...merch_line_items,
    ],
    customer_email: profile?.email ?? undefined,
    metadata: {
      registrationId,
      leagueId,
      userId,
      orgId,
      paymentType: 'player',
      ...(merchOrderIds.length > 0 ? { merchOrderIds: merchOrderIds.join(',') } : {}),
    },
    // Copy context onto the PaymentIntent too, so payment_intent.payment_failed
    // events carry registration/league/org info (Checkout does NOT propagate
    // session metadata to the PaymentIntent automatically).
    payment_intent_data: {
      metadata: { registrationId, leagueId, userId, orgId, paymentType: 'player' },
    },
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

  // Lock in discount use count now that a Stripe session is created
  if (discountApplied) {
    await db2.rpc('increment_discount_use', { discount_id: discountApplied.id })
  }

  return NextResponse.json({ url: session.url })
}
