import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { TeamsTable } from '@/components/admin/teams-table'

export default async function AdminTeamsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: rawTeams } = await supabase
    .from('teams')
    .select(`
      id, name, color, status,
      league:leagues!teams_league_id_fkey(id, name, slug, sport),
      team_members(id, status)
    `)
    .eq('organization_id', org.id)
    .order('name')

  const teams = (rawTeams ?? []).map(team => {
    const league = Array.isArray(team.league) ? team.league[0] : team.league
    const memberCount = (team.team_members ?? []).filter(
      (m: { status: string }) => m.status === 'active'
    ).length
    return {
      id: team.id,
      name: team.name,
      color: team.color,
      status: team.status,
      league: league ?? null,
      memberCount,
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-sm text-gray-500 mt-1">{teams.length} team{teams.length !== 1 ? 's' : ''} across all events</p>
        </div>
      </div>

      <TeamsTable teams={teams} totalCount={teams.length} />
    </div>
  )
}
