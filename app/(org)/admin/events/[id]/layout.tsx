import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { EventAdminTabs } from '@/components/layout/event-admin-tabs'
import { getEnforcementState } from '@/lib/billing'
import { FrozenLeagueBanner } from '@/components/billing/frozen-league-banner'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  registration_open: 'bg-green-100 text-green-700',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-purple-100 text-purple-700',
  archived: 'bg-gray-100 text-gray-400',
}

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (supabase as any)
    .from('leagues')
    .select('id, name, status, event_type, pickup_join_policy')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!league) notFound()

  // Check enforcement state to show frozen/grace banner
  const enforcement = await getEnforcementState(org.id)
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
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[league.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {league.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
      <div className="print:hidden">
        <EventAdminTabs leagueId={id} eventType={league.event_type ?? 'league'} pickupJoinPolicy={league.pickup_join_policy ?? 'public'} />
      </div>
      {children}
    </div>
  )
}
