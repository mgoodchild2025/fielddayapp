import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
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
  // Redirect a non-admin before any guarded loader runs: the admin layout renders
  // in parallel with this page, so its redirect alone doesn't stop the loaders throwing.
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const db = createServiceRoleClient()
  const { success, canceled } = await searchParams

  const [subscription, { count: activeLeagueCount }, { count: playerCount }] = await Promise.all([
    getSubscription(),

    db
      .from('leagues')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .in('status', ['registration_open', 'active']),
    db
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('role', 'player')
      .eq('status', 'active'),
  ])

  return (
    <BillingPageClient
      org={{ id: org.id, name: org.name }}
      subscription={subscription}
      successRedirect={success === '1'}
      canceledRedirect={canceled === '1'}
      activeLeagueCount={activeLeagueCount ?? 0}
      playerCount={playerCount ?? 0}
    />
  )
}
