'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'
import { getCurrentOrg } from '@/lib/tenant'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

async function requireOrgAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()
  if (!member || !['org_admin', 'league_admin'].includes(member.role)) redirect('/admin/dashboard')
  return org
}

// Returns the Stripe onboarding URL — client navigates there via window.location.href
export async function getConnectOnboardingUrl(): Promise<{ url: string } | { error: string }> {
  try {
    const org = await requireOrgAdmin()
    const supabase = createServiceRoleClient()

    const { data: existing } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id')
      .eq('organization_id', org.id)
      .single()

    let stripeAccountId = existing?.stripe_account_id

    if (!stripeAccountId) {
      const account = await stripe.accounts.create({ type: 'express', country: 'CA' })
      stripeAccountId = account.id
      await supabase.from('stripe_connect_accounts').insert({
        organization_id: org.id,
        stripe_account_id: stripeAccountId,
        status: 'pending',
        charges_enabled: false,
        payouts_enabled: false,
      })
    }

    // Build URLs on the org's own subdomain so the return route redirects back correctly
    const orgBase = `https://${org.slug}.${PLATFORM_DOMAIN}`
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${orgBase}/api/stripe/connect/refresh?orgId=${org.id}`,
      return_url: `${orgBase}/api/stripe/connect/return?orgId=${org.id}`,
      type: 'account_onboarding',
    })

    return { url: accountLink.url }
  } catch (err) {
    console.error('[stripe-connect] onboarding error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to start Stripe setup' }
  }
}

export async function disconnectConnectAccount() {
  const org = await requireOrgAdmin()
  const supabase = createServiceRoleClient()
  await supabase
    .from('stripe_connect_accounts')
    .delete()
    .eq('organization_id', org.id)
  redirect('/admin/settings/payments')
}
