import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'

export default async function AdminTeamsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: teams } = await supabase
    .from('teams')
    .select(`
      id, name, color, status,
      league:leagues!teams_league_id_fkey(id, name, slug, sport),
      team_members(id, status)
    `)
    .eq('organization_id', org.id)
    .order('name')

  const grouped = new Map<string, { league: { id: string; name: string; slug: string; sport: string | null }; teams: typeof teams }>()

  for (const team of teams ?? []) {
    const league = Array.isArray(team.league) ? team.league[0] : team.league
    if (!league) continue
    if (!grouped.has(league.id)) {
      grouped.set(league.id, { league, teams: [] })
    }
    grouped.get(league.id)!.teams!.push(team)
  }

  const leagueGroups = Array.from(grouped.values()).sort((a, b) =>
    a.league.name.localeCompare(b.league.name)
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-sm text-gray-500 mt-1">{teams?.length ?? 0} team{teams?.length !== 1 ? 's' : ''} across all leagues</p>
        </div>
      </div>

      {leagueGroups.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
          No teams yet. Teams are created when you set up leagues.
        </div>
      ) : (
        <div className="space-y-8">
          {leagueGroups.map(({ league, teams: leagueTeams }) => (
            <div key={league.id}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-semibold text-gray-800">{league.name}</h2>
                {league.sport && (
                  <span className="text-xs text-gray-500 capitalize">{league.sport.replace('_', ' ')}</span>
                )}
                <Link
                  href={`/admin/leagues/${league.slug ?? league.id}`}
                  className="text-xs hover:underline ml-auto"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  League settings →
                </Link>
              </div>

              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left">
                      <th className="px-4 py-3 font-medium text-gray-500">Team</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Players</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                      <th className="px-4 py-3 font-medium text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagueTeams?.map((team) => {
                      const activeCount = (team.team_members ?? []).filter(
                        (m: { status: string }) => m.status === 'active'
                      ).length
                      return (
                        <tr key={team.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {team.color && (
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                              )}
                              <span className="font-medium">{team.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{activeCount}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                team.status === 'active'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {team.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/teams/${team.id}`}
                              className="text-xs font-medium hover:underline"
                              style={{ color: 'var(--brand-primary)' }}
                            >
                              Manage →
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
