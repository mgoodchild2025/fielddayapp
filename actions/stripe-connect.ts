'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'
import { getCurrentOrg } from '@/lib/tenant'

const PLATFORM_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.fielddayapp.ca'

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

export async function startConnectOnboarding() {
  const org = await requireOrgAdmin()
  const supabase = createServiceRoleClient()

  // Reuse existing account if already created
  let { data: existing } = await supabase
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

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${PLATFORM_URL}/api/stripe/connect/refresh?orgId=${org.id}`,
    return_url: `${PLATFORM_URL}/api/stripe/connect/return?orgId=${org.id}`,
    type: 'account_onboarding',
  })

  redirect(accountLink.url)
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
