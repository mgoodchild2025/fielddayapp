import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

const shopCheckoutSchema = z.object({
  orgId: z.string().uuid(),
  items: z.array(z.object({
    itemId: z.string().uuid(),
    variantId: z.string().uuid().nullable(),
    quantity: z.number().int().min(1).max(10),
  })).min(1),
  discountId: z.string().uuid().optional(),
})

type MerchItemRow    = { id: string; price_cents: number; name: string; is_active: boolean; shop_enabled: boolean; currency: string }
type MerchVariantRow = { id: string; item_id: string; label: string; stock_quantity: number | null }

export async function POST(request: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // ── Parse + validate input ────────────────────────────────────────────────
  const body = await request.json()
  const parsed = shopCheckoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { orgId, items, discountId } = parsed.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  // ── Verify org membership ─────────────────────────────────────────────────
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 })
  }

  // ── Load org payment settings ─────────────────────────────────────────────
  const { data: paymentSettings } = await db
    .from('org_payment_settings')
    .select('stripe_secret_key, shop_payment_mode, manual_payment_instructions')
    .eq('organization_id', orgId)
    .maybeSingle()

  // Determine effective mode: if shop_payment_mode is 'manual' OR no Stripe key configured → manual path
  const isManualMode =
    paymentSettings?.shop_payment_mode === 'manual' ||
    !paymentSettings?.stripe_secret_key

  // ── Resolve item + variant metadata server-side ───────────────────────────
  const itemIds    = [...new Set(items.map((s) => s.itemId))]
  const variantIds = items.map((s) => s.variantId).filter(Boolean) as string[]

  const [{ data: merchItems }, { data: merchVariants }] = await Promise.all([
    db.from('merchandise_items')
      .select('id, price_cents, name, currency, is_active, shop_enabled')
      .in('id', itemIds)
      .eq('organization_id', orgId),
    variantIds.length > 0
      ? db.from('merchandise_variants').select('id, item_id, label, stock_quantity').in('id', variantIds)
      : Promise.resolve({ data: [] }),
  ])

  const itemMap    = new Map<string, MerchItemRow>()
  const variantMap = new Map<string, MerchVariantRow>()
  for (const i of (merchItems    ?? []) as MerchItemRow[])    itemMap.set(i.id, i)
  for (const v of (merchVariants ?? []) as MerchVariantRow[]) variantMap.set(v.id, v)

  // Derive currency from first resolved item
  let currency = 'cad'
  const firstItem = itemMap.values().next().value as MerchItemRow | undefined
  if (firstItem?.currency) currency = firstItem.currency

  // Validate all items are active + shop-enabled, variants exist
  for (const sel of items) {
    const item = itemMap.get(sel.itemId)
    if (!item || !item.is_active || !item.shop_enabled) {
      return NextResponse.json({ error: 'One or more items are no longer available.' }, { status: 400 })
    }
    if (sel.variantId && !variantMap.has(sel.variantId)) {
      return NextResponse.json({ error: 'Selected variant not found.' }, { status: 400 })
    }
  }

  // ── Fresh stock read ──────────────────────────────────────────────────────
  // Re-read stock quantities right before we attempt to reserve them so the
  // values are as current as possible.
  const { data: freshRows } = variantIds.length > 0
    ? await db.from('merchandise_variants').select('id, stock_quantity').in('id', variantIds)
    : { data: [] }

  const freshStock = new Map<string, number | null>()
  for (const row of (freshRows ?? []) as { id: string; stock_quantity: number | null }[]) {
    freshStock.set(row.id, row.stock_quantity)
  }

  // ── Pre-flight stock check (fail fast before touching any rows) ───────────
  for (const sel of items) {
    if (!sel.variantId) continue
    const available = freshStock.get(sel.variantId)
    if (available !== null && available !== undefined && available < sel.quantity) {
      const item    = itemMap.get(sel.itemId)
      const variant = variantMap.get(sel.variantId)
      const label   = variant ? ` — ${variant.label}` : ''
      return NextResponse.json({
        error: `"${item?.name}${label}" only has ${available} left in stock. Please update your cart.`,
      }, { status: 409 })
    }
  }

  // ── Atomic stock reservation (optimistic-lock per variant) ────────────────
  // For each variant with finite stock: UPDATE ... WHERE stock_quantity = <currentValue>
  // If the row changed between our read and this write, the WHERE won't match and
  // we return 0 rows — meaning another user grabbed the last stock. We then
  // restore any variants we already decremented and return a 409.
  const decremented: Array<{ variantId: string; restoreTo: number }> = []

  for (const sel of items) {
    if (!sel.variantId) continue
    const currentQty = freshStock.get(sel.variantId)
    if (currentQty === null || currentQty === undefined) continue  // null = unlimited

    const newQty = currentQty - sel.quantity

    const { data: updated } = await db
      .from('merchandise_variants')
      .update({ stock_quantity: newQty })
      .eq('id', sel.variantId)
      .eq('stock_quantity', currentQty)   // optimistic lock: only matches if unchanged
      .select('id')

    if (!updated || (updated as unknown[]).length === 0) {
      // Another user grabbed the stock between our read and this write — restore
      await restoreStock(db, decremented)
      const item    = itemMap.get(sel.itemId)
      const variant = variantMap.get(sel.variantId)
      const label   = variant ? ` — ${variant.label}` : ''
      return NextResponse.json({
        error: `"${item?.name}${label}" just sold out. Please update your cart.`,
      }, { status: 409 })
    }

    decremented.push({ variantId: sel.variantId, restoreTo: currentQty })
  }

  // ── Resolve discount code before inserting orders ────────────────────────
  // Must happen here (before insert) so we can store discount_cents on each row.
  let discountApplied: { id: string; type: string; value: number } | null = null
  if (discountId) {
    const { data: dr } = await db
      .from('discount_codes')
      .select('id, type, value, active, expires_at, max_uses, use_count, applies_to')
      .eq('id', discountId)
      .eq('organization_id', orgId)
      .single()
    if (
      dr && dr.active &&
      (!dr.expires_at || new Date(dr.expires_at) > new Date()) &&
      (!dr.max_uses || dr.use_count < dr.max_uses) &&
      (dr.applies_to === 'all' || dr.applies_to === 'shop')
    ) {
      discountApplied = { id: dr.id, type: dr.type, value: dr.value }
    }
  }

  // Compute basket subtotal and total discount reduction
  const subtotalCents = items.reduce((s, sel) => s + itemMap.get(sel.itemId)!.price_cents * sel.quantity, 0)
  let totalReduction = 0
  if (discountApplied) {
    totalReduction = discountApplied.type === 'percent'
      ? Math.round(subtotalCents * discountApplied.value / 100)
      : Math.min(discountApplied.value * 100, subtotalCents)
  }

  // Pro-rate discount across order rows proportionally by (unit_price × qty).
  // Remainder assigned to last row to avoid rounding drift.
  const orderDiscounts: number[] = []
  if (totalReduction > 0) {
    let allocated = 0
    for (let i = 0; i < items.length; i++) {
      if (i === items.length - 1) {
        orderDiscounts.push(totalReduction - allocated)
      } else {
        const lineCents = itemMap.get(items[i].itemId)!.price_cents * items[i].quantity
        const share = Math.round(totalReduction * lineCents / subtotalCents)
        orderDiscounts.push(share)
        allocated += share
      }
    }
  } else {
    items.forEach(() => orderDiscounts.push(0))
  }

  // ── Create pending merchandise_orders ─────────────────────────────────────
  const orderRows = items.map((sel, i) => ({
    organization_id:  orgId,
    league_id:        null,
    registration_id:  null,
    user_id:          user.id,
    item_id:          sel.itemId,
    variant_id:       sel.variantId ?? null,
    quantity:         sel.quantity,
    unit_price_cents: itemMap.get(sel.itemId)!.price_cents,
    discount_cents:   orderDiscounts[i] ?? 0,
    discount_code_id: discountApplied ? discountApplied.id : null,
    status:           'pending',
  }))

  const { data: insertedOrders, error: insertError } = await db
    .from('merchandise_orders')
    .insert(orderRows)
    .select('id')

  if (insertError) {
    await restoreStock(db, decremented)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const orderIds = ((insertedOrders ?? []) as { id: string }[]).map((r) => r.id)

  // ── Manual payment path — skip Stripe entirely ────────────────────────────
  if (isManualMode) {
    // Still lock in discount use count for manual orders
    if (discountApplied) {
      await db.rpc('increment_discount_use', { discount_id: discountApplied.id })
    }
    return NextResponse.json({
      manual: true,
      instructions: paymentSettings?.manual_payment_instructions ?? null,
    })
  }

  // ── Build Stripe line items ───────────────────────────────────────────────
  const lineItems = items.map((sel) => {
    const item    = itemMap.get(sel.itemId)!
    const variant = sel.variantId ? variantMap.get(sel.variantId) : null
    const label   = variant ? `${item.name} — ${variant.label}` : item.name
    return {
      price_data: {
        currency,
        unit_amount: item.price_cents,
        product_data: { name: label },
      },
      quantity: sel.quantity,
    }
  })

  // If a discount applies, add a negative-amount line item (Stripe coupon alternative)
  if (discountApplied && totalReduction > 0) {
    lineItems.push({
      price_data: {
        currency,
        unit_amount: -totalReduction,
        product_data: { name: `Discount (${discountApplied.type === 'percent' ? `${discountApplied.value}%` : `$${discountApplied.value}`} off)` },
      },
      quantity: 1,
    })
  }

  // ── Create Stripe checkout session ────────────────────────────────────────
  const orgStripe = new Stripe(paymentSettings.stripe_secret_key, {
    apiVersion: '2026-05-27.dahlia' as const,
    typescript: true,
  })

  const { data: profile } = await (createServiceRoleClient() as any)
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single()

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''

  let session: Stripe.Checkout.Session
  try {
    session = await orgStripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      currency,
      line_items: lineItems,
      customer_email: profile?.email ?? undefined,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30-minute window
      metadata: {
        paymentType:   'shop',
        orgId,
        userId:        user.id,
        merchOrderIds: orderIds.join(','),
      },
      success_url: `${origin}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/shop`,
    })
  } catch (err) {
    // Stripe session creation failed — restore stock and delete the pending orders
    await restoreStock(db, decremented)
    await db.from('merchandise_orders').delete().in('id', orderIds)
    console.error('[shop-checkout] Stripe session creation failed:', err)
    return NextResponse.json({ error: 'Could not create checkout session. Please try again.' }, { status: 500 })
  }

  // Lock in discount use count
  if (discountApplied) {
    await db.rpc('increment_discount_use', { discount_id: discountApplied.id })
  }

  return NextResponse.json({ url: session.url })
}

// ── Helper: restore previously decremented variant stock ──────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function restoreStock(db: any, decremented: Array<{ variantId: string; restoreTo: number }>) {
  for (const d of decremented) {
    await db
      .from('merchandise_variants')
      .update({ stock_quantity: d.restoreTo })
      .eq('id', d.variantId)
  }
}
