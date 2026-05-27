import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getDisplayConfig, getDisplayScreens } from '@/actions/display'
import { defaultConfig } from '@/lib/display-types'
import { DisplayControlPanel } from '@/components/display/display-control-panel'

export const dynamic  = 'force-dynamic'
export const metadata = { title: 'Display Mode' }

export default async function DisplayAdminPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  const [{ data: league }, { data: branding }] = await Promise.all([
    db.from('leagues').select('id, name, sport, slug').eq('id', id).eq('organization_id', org.id).single(),
    db.from('org_branding').select('timezone').eq('organization_id', org.id).single(),
  ])
  if (!league) notFound()

  const timezone = branding?.timezone ?? 'America/Toronto'

  // Fetch pools for filter options
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: poolsData } = await (db as any)
    .from('pools')
    .select('id, name')
    .eq('league_id', id)
    .eq('organization_id', org.id)
    .order('sort_order')
  const pools: { id: string; name: string }[] = poolsData ?? []

  // Load all existing screen configs
  const screenList = await getDisplayScreens(id)

  // Pre-load configs for all existing screens (+ screen 1 default)
  const screenNumbers = screenList.length > 0
    ? screenList.map((s) => s.screen_number)
    : [1]

  const screenConfigs = await Promise.all(
    screenNumbers.map(async (n) => {
      const stored = await getDisplayConfig(id, n)
      return {
        screen: n,
        enabled: stored?.enabled ?? false,
        config: stored?.config ?? defaultConfig(),
      }
    })
  )

  const displayBaseUrl = `https://${org.slug}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'}/events/${league.slug}/display`

  return (
    <DisplayControlPanel
      leagueId={id}
      leagueName={league.name}
      displayBaseUrl={displayBaseUrl}
      pools={pools}
      timezone={timezone}
      initialScreens={screenConfigs}
    />
  )
}
