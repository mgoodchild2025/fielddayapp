import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'

const PLATFORM_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.fielddayapp.ca'

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.redirect(new URL('/admin/settings/payments', request.url))

  const supabase = createServiceRoleClient()

  const { data: connectAccount } = await supabase
    .from('stripe_connect_accounts')
    .select('stripe_account_id')
    .eq('organization_id', orgId)
    .single()

  if (!connectAccount?.stripe_account_id) {
    const host = request.headers.get('host') ?? ''
    const proto = request.headers.get('x-forwarded-proto') ?? 'https'
    return NextResponse.redirect(`${proto}://${host}/admin/settings/payments`)
  }

  const accountLink = await stripe.accountLinks.create({
    account: connectAccount.stripe_account_id,
    refresh_url: `${PLATFORM_URL}/api/stripe/connect/refresh?orgId=${orgId}`,
    return_url: `${PLATFORM_URL}/api/stripe/connect/return?orgId=${orgId}`,
    type: 'account_onboarding',
  })

  return NextResponse.redirect(accountLink.url)
}
