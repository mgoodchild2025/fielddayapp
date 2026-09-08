import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { publicOrigin } from '@/lib/public-origin'

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId')
  // Never build redirects from request.url — behind the proxy it is the container address.
  if (!orgId) return NextResponse.redirect(`${publicOrigin(request)}/admin/settings/payments`)

  const supabase = createServiceRoleClient()

  const { data: connectAccount } = await supabase
    .from('stripe_connect_accounts')
    .select('stripe_account_id')
    .eq('organization_id', orgId)
    .single()

  if (connectAccount?.stripe_account_id) {
    const account = await stripe.accounts.retrieve(connectAccount.stripe_account_id)
    await supabase
      .from('stripe_connect_accounts')
      .update({
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        status: account.charges_enabled ? 'active' : 'pending',
      })
      .eq('organization_id', orgId)
  }

  // Redirect to the org's admin settings page
  return NextResponse.redirect(`${publicOrigin(request)}/admin/settings/payments`)
}
