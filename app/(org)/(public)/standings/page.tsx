import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'

interface TeamStat {
  id: string
  name: string
  league_id: string
  division_id: string | null
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
}

function StandingsTable({ teams }: { teams: TeamStat[] }) {
  const sorted = [...teams].sort(
    (a, b) => b.wins - a.wins || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
  )
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[360px]">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Team</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">W</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">L</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">PF</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">PA</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Diff</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, i) => (
              <tr key={team.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                <td className="px-4 py-3 font-medium">{team.name}</td>
                <td className="px-4 py-3 text-center font-semibold" style={{ color: 'var(--brand-primary)' }}>{team.wins}</td>
                <td className="px-4 py-3 text-center text-gray-600">{team.losses}</td>
                <td className="px-4 py-3 text-center text-gray-600">{team.pointsFor}</td>
                <td className="px-4 py-3 text-center text-gray-600">{team.pointsAgainst}</td>
                <td className="px-4 py-3 text-center text-gray-600">
                  {team.pointsFor - team.pointsAgainst > 0 ? '+' : ''}{team.pointsFor - team.pointsAgainst}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No results yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function StandingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireAuth()

  const supabase = await createServerClient()
  const { data: branding } = await supabase
    .from('org_branding')
    .select('logo_url')
    .eq('organization_id', org.id)
    .single()

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, slug')
    .eq('organization_id', org.id)
    .in('status', ['active', 'completed'])

  const { data: divisions } = await supabase
    .from('divisions')
    .select('id, name, league_id, sort_order')
    .eq('organization_id', org.id)
    .order('sort_order', { ascending: true })

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, league_id, division_id')
    .eq('organization_id', org.id)
    .eq('status', 'active')

  const { data: results } = await supabase
    .from('game_results')
    .select(`
      home_score, away_score, status,
      game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status)
    `)
    .eq('organization_id', org.id)
    .eq('status', 'confirmed')

  // Build standings record from confirmed results
  const record: Record<string, { wins: number; losses: number; pointsFor: number; pointsAgainst: number }> = {}

  for (const r of results ?? []) {
    const game = Array.isArray(r.game) ? r.game[0] : r.game
    if (!game || game.status !== 'completed') continue
    const { home_team_id, away_team_id } = game
    if (!home_team_id || !away_team_id) continue

    if (!record[home_team_id]) record[home_team_id] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }
    if (!record[away_team_id]) record[away_team_id] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }

    const hs = r.home_score ?? 0
    const as_ = r.away_score ?? 0
    record[home_team_id].pointsFor += hs
    record[home_team_id].pointsAgainst += as_
    record[away_team_id].pointsFor += as_
    record[away_team_id].pointsAgainst += hs

    if (hs > as_) { record[home_team_id].wins++; record[away_team_id].losses++ }
    else { record[away_team_id].wins++; record[home_team_id].losses++ }
  }

  function teamStats(t: { id: string; name: string; league_id: string; division_id: string | null }): TeamStat {
    return { ...t, ...(record[t.id] ?? { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }) }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold uppercase mb-6 sm:mb-8" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Standings
        </h1>

        {leagues?.map((league) => {
          const leagueTeams = (teams ?? []).filter((t) => t.league_id === league.id)
          const leagueDivisions = (divisions ?? []).filter((d) => d.league_id === league.id)
          const hasDivisions = leagueDivisions.length > 0

          return (
            <div key={league.id} className="mb-12">
              <h2 className="text-2xl font-bold mb-5" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                {league.name}
              </h2>

              {hasDivisions ? (
                <div className="space-y-6">
                  {leagueDivisions.map((div) => {
                    const divTeams = leagueTeams
                      .filter((t) => t.division_id === div.id)
                      .map(teamStats)
                    return (
                      <div key={div.id}>
                        <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-2">
                          {div.name}
                        </h3>
                        <StandingsTable teams={divTeams} />
                      </div>
                    )
                  })}
                  {/* Unassigned teams */}
                  {leagueTeams.filter((t) => !t.division_id).length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-2">
                        Unassigned
                      </h3>
                      <StandingsTable teams={leagueTeams.filter((t) => !t.division_id).map(teamStats)} />
                    </div>
                  )}
                </div>
              ) : (
                <StandingsTable teams={leagueTeams.map(teamStats)} />
              )}
            </div>
          )
        })}

        {(!leagues || leagues.length === 0) && (
          <p className="text-gray-500 text-center py-16">No active leagues.</p>
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
