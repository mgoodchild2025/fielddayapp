import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { getDisplayConfig, getDisplayData } from '@/actions/display'
import { defaultConfig } from '@/lib/display-types'
import { DisplayScreen } from '@/components/display/display-screen'

export const dynamic   = 'force-dynamic'
export const metadata  = { title: 'Display' }

export default async function DisplayPage({
  params,
}: {
  params: Promise<{ slug: string; screen: string }>
}) {
  const { slug, screen: screenStr } = await params
  const screen = parseInt(screenStr, 10)
  if (isNaN(screen) || screen < 1 || screen > 4) notFound()

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const db = createServiceRoleClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, sport')
    .eq('organization_id', org.id)
    .eq('slug', slug)
    .single()

  if (!league) notFound()

  // Fetch display config (no auth needed)
  const stored = await getDisplayConfig(league.id, screen)

  // If no config exists yet, or display is disabled → show offline screen
  if (!stored || !stored.enabled) {
    const isDark = stored?.config?.theme !== 'light'
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6"
        style={{ backgroundColor: isDark ? '#09090b' : '#f9fafb' }}
      >
        <div className="text-6xl">📺</div>
        <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Display is offline
        </p>
        <p className={`text-base ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          Screen {screen} · {league.name}
        </p>
        <p className={`text-sm ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>
          Enable this display from the event admin panel to show content here.
        </p>
      </div>
    )
  }

  const config = stored.config ?? defaultConfig()

  // Fetch org timezone
  const { data: branding } = await db
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  // Fetch all data needed for the configured zones
  const data = await getDisplayData(league.id, org.id, config, timezone)

  return <DisplayScreen config={config} data={data} screen={screen} />
}
