import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { getSubscription } from '@/actions/billing'
import { BillingPageClient } from './billing-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Billing — Fieldday' }

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>
}) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const subscription = await getSubscription()
  const { success, canceled } = await searchParams

  return (
    <BillingPageClient
      org={{ id: org.id, name: org.name }}
      subscription={subscription}
      successRedirect={success === '1'}
      canceledRedirect={canceled === '1'}
    />
  )
}
