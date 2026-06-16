import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getDisplayConfig, getDisplayScreens } from '@/actions/display'
import { getActiveLiveStreams } from '@/actions/live'
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

  // Fetch pools and bracket tiers for filter options
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: poolsData }, { data: configRow }] = await Promise.all([
    (db as any).from('pools').select('id, name').eq('league_id', id).eq('organization_id', org.id).order('sort_order'),
    (db as any).from('playoff_configs').select('id').eq('league_id', id).eq('organization_id', org.id).maybeSingle(),
  ])
  const pools: { id: string; name: string }[] = poolsData ?? []

  // Bracket tiers (Gold / Silver / Bronze etc.) — used to populate the tier picker
  let bracketTiers: { name: string }[] = []
  if (configRow?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tiersData } = await (db as any)
      .from('playoff_tiers')
      .select('name')
      .eq('config_id', configRow.id)
      .not('bracket_id', 'is', null)
      .order('sort_order')
    bracketTiers = tiersData ?? []
  }

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

  // Currently-live streams for the per-screen stream picker (this event + org-wide).
  const allLive = await getActiveLiveStreams(org.id)
  const liveStreams = allLive
    .filter((s) => s.league_id === id || s.league_id === null)
    .map((s) => ({ id: s.id, title: s.title, platform: s.platform }))

  return (
    <DisplayControlPanel
      leagueId={id}
      leagueName={league.name}
      displayBaseUrl={displayBaseUrl}
      pools={pools}
      bracketTiers={bracketTiers}
      timezone={timezone}
      initialScreens={screenConfigs}
      liveStreams={liveStreams}
    />
  )
}
