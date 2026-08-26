'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

// ── Org tax rates (X1) ────────────────────────────────────────────────────────
// Each rate is mirrored as a Stripe Tax Rate object in the ORG'S OWN Stripe
// account so checkouts can attach it to line items — Stripe does the math and
// receipts itemize the tax by name. Stripe tax rates are immutable once
// created (percentage/inclusive can't change), so "edit" = archive + create,
// and our rows follow the same rule: deactivate and add a new one.

async function getOrgAndRequireAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])
  return org
}

export interface TaxRateInput {
  displayName: string
  percentage: number
  inclusive: boolean
  appliesTo: 'all' | 'registrations' | 'merch'
}

export async function createTaxRate(input: TaxRateInput): Promise<{ error: string | null }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  const name = input.displayName.trim().slice(0, 20)
  const pct = Number(input.percentage)
  if (!name) return { error: 'Give the rate a name (e.g. HST).' }
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { error: 'Percentage must be between 0 and 100.' }

  // Two active rates max — GST + PST is the real-world ceiling; more is a
  // config mistake we'd rather block than bill.
  const { count: activeCount } = await db
    .from('org_tax_rates')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('active', true)
  if ((activeCount ?? 0) >= 2) return { error: 'At most two active tax rates (e.g. GST + PST). Deactivate one first.' }

  // Inclusive and exclusive don't mix — the math would be ambiguous.
  if (activeCount && activeCount > 0) {
    const { data: existing } = await db
      .from('org_tax_rates')
      .select('inclusive')
      .eq('organization_id', org.id)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    if (existing && existing.inclusive !== input.inclusive) {
      return { error: 'All active rates must be the same mode (all tax-inclusive or all added on top).' }
    }
  }

  // Mirror in the org's Stripe account when they have one connected. An org
  // without Stripe (offline payments only) still gets the rate — lib/tax.ts
  // computes those splits.
  let stripeTaxRateId: string | null = null
  const { data: settings } = await db
    .from('org_payment_settings')
    .select('stripe_secret_key')
    .eq('organization_id', org.id)
    .maybeSingle()
  if (settings?.stripe_secret_key) {
    try {
      const stripe = new Stripe(settings.stripe_secret_key, { apiVersion: '2026-05-27.dahlia' as const, typescript: true })
      const rate = await stripe.taxRates.create({
        display_name: name,
        percentage: pct,
        inclusive: input.inclusive,
        country: 'CA',
      })
      stripeTaxRateId = rate.id
    } catch (err) {
      return { error: `Stripe rejected the tax rate: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  const { error } = await db.from('org_tax_rates').insert({
    organization_id: org.id,
    display_name: name,
    percentage: pct,
    inclusive: input.inclusive,
    applies_to: input.appliesTo,
    stripe_tax_rate_id: stripeTaxRateId,
  })
  if (error) return { error: error.message }

  revalidatePath('/admin/settings/payments')
  return { error: null }
}

export async function deactivateTaxRate(rateId: string): Promise<{ error: string | null }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  const { data: rate } = await db
    .from('org_tax_rates')
    .select('id, stripe_tax_rate_id')
    .eq('id', rateId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!rate) return { error: 'Rate not found' }

  // Archive in Stripe too (best effort — the local deactivation is what stops
  // new charges from using it).
  if (rate.stripe_tax_rate_id) {
    const { data: settings } = await db
      .from('org_payment_settings')
      .select('stripe_secret_key')
      .eq('organization_id', org.id)
      .maybeSingle()
    if (settings?.stripe_secret_key) {
      try {
        const stripe = new Stripe(settings.stripe_secret_key, { apiVersion: '2026-05-27.dahlia' as const, typescript: true })
        await stripe.taxRates.update(rate.stripe_tax_rate_id, { active: false })
      } catch { /* archived locally regardless */ }
    }
  }

  const { error } = await db.from('org_tax_rates').update({ active: false }).eq('id', rate.id)
  if (error) return { error: error.message }

  revalidatePath('/admin/settings/payments')
  return { error: null }
}
