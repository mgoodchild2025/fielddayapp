import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { PositionsEditor } from '@/components/positions/positions-editor'
import type { SportPosition } from '@/actions/positions'

const SPORT_LABELS: Record<string, string> = {
  beach_volleyball: 'Beach Volleyball',
  volleyball: 'Volleyball',
  hockey: 'Hockey',
  basketball: 'Basketball',
  soccer: 'Soccer',
  baseball: 'Baseball',
  softball: 'Softball',
  football: 'Football',
  ultimate: 'Ultimate Frisbee',
  rugby: 'Rugby',
}

export default async function AdminPositionsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // Get all sports used by this org's leagues
  const { data: leagues } = await db
    .from('leagues')
    .select('sport')
    .eq('organization_id', org.id)
    .not('sport', 'is', null)

  // Get all sports this org has custom positions for
  const { data: customRows } = await db
    .from('sport_positions')
    .select('sport')
    .eq('organization_id', org.id)

  const leagueSports = new Set((leagues ?? []).map(l => l.sport).filter(Boolean) as string[])
  const customSports = new Set((customRows ?? []).map(r => r.sport))
  const allSports = Array.from(new Set([...leagueSports, ...customSports]))

  // Also include all platform-default sports so admins can customise proactively
  const { data: platformSports } = await db
    .from('sport_positions')
    .select('sport')
    .is('organization_id', null)

  const platformSportSet = Array.from(new Set((platformSports ?? []).map(r => r.sport)))
  const sportsToShow = Array.from(new Set([...allSports, ...platformSportSet]))

  // Fetch positions per sport (org-specific if available, else defaults)
  const sportData: Array<{ sport: string; label: string; positions: SportPosition[]; isCustom: boolean }> = []

  for (const sport of sportsToShow) {
    const orgPositions = (customRows ?? []).filter(r => r.sport === sport)
    const isCustom = orgPositions.length > 0

    let positions: SportPosition[] = []
    if (isCustom) {
      const { data } = await db
        .from('sport_positions')
        .select('id, sport, name, display_order, organization_id')
        .eq('organization_id', org.id)
        .eq('sport', sport)
        .order('display_order')
      positions = (data ?? []) as SportPosition[]
    } else {
      const { data } = await db
        .from('sport_positions')
        .select('id, sport, name, display_order, organization_id')
        .is('organization_id', null)
        .eq('sport', sport)
        .order('display_order')
      positions = (data ?? []) as SportPosition[]
    }

    sportData.push({
      sport,
      label: SPORT_LABELS[sport] ?? sport,
      positions,
      isCustom,
    })
  }

  sportData.sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Positions</h1>
      <p className="text-sm text-gray-500 mb-6">
        Customise available positions per sport. Platform defaults are used unless you override them.
      </p>

      <div className="space-y-4">
        {sportData.map(({ sport, label, positions, isCustom }) => (
          <div key={sport} className="bg-white rounded-lg border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{label}</h2>
              {isCustom ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Custom</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Platform defaults</span>
              )}
            </div>
            <PositionsEditor sport={sport} positions={positions} isCustom={isCustom} />
          </div>
        ))}

        {sportData.length === 0 && (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-400 text-sm">
            No sports configured yet. Create a league first to see positions here.
          </div>
        )}
      </div>
    </div>
  )
}
