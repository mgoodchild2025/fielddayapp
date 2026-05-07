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
})

type MerchItemRow = { id: string; price_cents: number; name: string; is_active: boolean; shop_enabled: boolean; currency: string }
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

  const { orgId, items } = parsed.data
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db2 = db as any

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
  const { data: paymentSettings } = await db2
    .from('org_payment_settings')
    .select('stripe_secret_key')
    .eq('organization_id', orgId)
    .single()

  if (!paymentSettings?.stripe_secret_key) {
    return NextResponse.json(
      { error: 'This organization has not configured online payments.' },
      { status: 422 }
    )
  }

  // Currency: derive from the first shop item's currency (all items are org-scoped and share currency)
  // We'll resolve this after loading items; default to 'cad'
  let currency = 'cad'

  // ── Resolve item prices server-side (never trust client) ──────────────────
  const itemIds = [...new Set(items.map((s) => s.itemId))]
  const variantIds = items.map((s) => s.variantId).filter(Boolean) as string[]

  const [{ data: merchItems }, { data: merchVariants }] = await Promise.all([
    db2.from('merchandise_items')
      .select('id, price_cents, name, currency, is_active, shop_enabled')
      .in('id', itemIds)
      .eq('organization_id', orgId),
    variantIds.length > 0
      ? db2.from('merchandise_variants').select('id, item_id, label, stock_quantity').in('id', variantIds)
      : Promise.resolve({ data: [] }),
  ])

  const itemMap = new Map<string, MerchItemRow>()
  for (const i of (merchItems ?? []) as MerchItemRow[]) itemMap.set(i.id, i)

  const variantMap = new Map<string, MerchVariantRow>()
  for (const v of (merchVariants ?? []) as MerchVariantRow[]) variantMap.set(v.id, v)

  // Derive currency from first resolved item (items in same org share currency)
  const firstItem = itemMap.values().next().value as MerchItemRow | undefined
  if (firstItem?.currency) currency = firstItem.currency

  // Validate all items are active and shop-enabled
  for (const sel of items) {
    const item = itemMap.get(sel.itemId)
    if (!item || !item.is_active || !item.shop_enabled) {
      return NextResponse.json({ error: `Item is no longer available` }, { status: 400 })
    }
    if (sel.variantId && !variantMap.has(sel.variantId)) {
      return NextResponse.json({ error: `Selected variant not found` }, { status: 400 })
    }
  }

  // ── Create pending merchandise_orders ─────────────────────────────────────
  const orderRows = items.map((sel) => {
    const item = itemMap.get(sel.itemId)!
    return {
      organization_id: orgId,
      league_id: null,          // standalone shop order — no league
      registration_id: null,
      user_id: user.id,
      item_id: sel.itemId,
      variant_id: sel.variantId ?? null,
      quantity: sel.quantity,
      unit_price_cents: item.price_cents,
      status: 'pending',
    }
  })

  const { data: insertedOrders, error: insertError } = await db2
    .from('merchandise_orders')
    .insert(orderRows)
    .select('id')

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const orderIds = ((insertedOrders ?? []) as { id: string }[]).map((r) => r.id)

  // ── Build Stripe line items ───────────────────────────────────────────────
  const lineItems = items.map((sel) => {
    const item = itemMap.get(sel.itemId)!
    const variant = sel.variantId ? variantMap.get(sel.variantId) : null
    const label = variant ? `${item.name} — ${variant.label}` : item.name
    return {
      price_data: {
        currency,
        unit_amount: item.price_cents,
        product_data: { name: label },
      },
      quantity: sel.quantity,
    }
  })

  // ── Create Stripe checkout session ────────────────────────────────────────
  const orgStripe = new Stripe(paymentSettings.stripe_secret_key, {
    apiVersion: '2026-04-22.dahlia' as const,
    typescript: true,
  })

  const { data: profile } = await db
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single()

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''

  const session = await orgStripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    currency,
    line_items: lineItems,
    customer_email: profile?.email ?? undefined,
    metadata: {
      paymentType: 'shop',
      orgId,
      userId: user.id,
      merchOrderIds: orderIds.join(','),
    },
    success_url: `${origin}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/shop`,
  })

  return NextResponse.json({ url: session.url })
}
