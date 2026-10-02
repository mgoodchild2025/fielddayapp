import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { EventAdminTabs } from '@/components/layout/event-admin-tabs'
import { getEnforcementState } from '@/lib/billing'
import { canAccess } from '@/lib/features'
import { FrozenLeagueBanner } from '@/components/billing/frozen-league-banner'
import { StatusChip } from '@/components/ui/status-chip'

export default async function EventAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()


  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, status, event_type, pickup_join_policy')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!league) notFound()

  // Check enforcement state to show frozen/grace banner
  const enforcement = await getEnforcementState(org.id)
  const hasFinances = await canAccess(org.id, 'financial_tools')
  const isFrozen = enforcement.frozenLeagueIds.includes(id)
  // During grace, show warning on leagues that would be frozen once grace expires
  const isAtRiskDuringGrace = !isFrozen && enforcement.inGracePeriod && enforcement.atRiskLeagueIds.includes(id)

  return (
    <div>
      {isFrozen && (
        <div className="print:hidden">
          <FrozenLeagueBanner />
        </div>
      )}
      {isAtRiskDuringGrace && enforcement.graceDaysLeft !== null && (
        <div className="print:hidden">
          <FrozenLeagueBanner graceDaysLeft={enforcement.graceDaysLeft} />
        </div>
      )}
      <div className="print:hidden mb-6">
        <Link href="/admin/events" className="text-sm text-gray-400 hover:text-gray-600">
          ← Events
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-xl sm:text-2xl font-bold">{league.name}</h1>
          <StatusChip kind="event" status={league.status} />
        </div>
      </div>
      <div className="print:hidden">
        <EventAdminTabs leagueId={id} eventType={league.event_type ?? 'league'} pickupJoinPolicy={league.pickup_join_policy ?? 'public'} hasFinances={hasFinances} />
      </div>
      {children}
    </div>
  )
}
