import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.redirect(new URL('/admin/settings/payments', request.url))

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
  const host = request.headers.get('host') ?? ''
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return NextResponse.redirect(`${proto}://${host}/admin/settings/payments`)
}
