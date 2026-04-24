import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { AdminCreateTeamForm } from '@/components/teams/admin-create-team-form'
import { AdminAddMemberForm } from '@/components/teams/admin-add-member-form'
import { TeamCodeBadge } from '@/components/teams/team-code-badge'
import { RemovePlayerButton } from '@/components/teams/remove-player-button'
import { DeleteTeamButton } from '@/components/teams/delete-team-button'

export default async function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: teams } = await supabase
    .from('teams')
    .select(`
      id, name, color, team_code, created_at,
      team_members(
        id, role, status, invited_email,
        profiles!team_members_user_id_fkey(full_name)
      )
    `)
    .eq('league_id', id)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: true })

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        {teams && teams.length > 0 ? (
          teams.map((team) => {
            const members = team.team_members ?? []
            const captain = members.find((m) => m.role === 'captain')
            const captainProfile = Array.isArray(captain?.profiles) ? captain?.profiles[0] : captain?.profiles
            const activePlayers = members.filter((m) => m.status === 'active')

            return (
              <div key={team.id} className="bg-white rounded-lg border p-4">
                <div className="flex items-center gap-3 mb-2">
                  {team.color && (
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                  )}
                  <h3 className="font-semibold">{team.name}</h3>
                  <span className="text-xs text-gray-400 ml-auto">
                    {activePlayers.length} player{activePlayers.length !== 1 ? 's' : ''}
                  </span>
                  <DeleteTeamButton teamId={team.id} teamName={team.name} leagueId={id} />
                </div>

                {captainProfile?.full_name && (
                  <p className="text-sm text-gray-500 mb-2">
                    Captain: <span className="font-medium text-gray-700">{captainProfile.full_name}</span>
                  </p>
                )}

                {team.team_code && (
                  <TeamCodeBadge teamId={team.id} code={team.team_code} />
                )}

                <div className="flex flex-wrap gap-1.5 mt-2">
                  {members.map((m) => {
                    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
                    const displayName = profile?.full_name ?? m.invited_email ?? null
                    if (!displayName) return null
                    return (
                      <span
                        key={m.id}
                        className={`inline-flex items-center text-xs rounded-full px-2 py-0.5 ${
                          m.role === 'captain' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {displayName}
                        {m.status === 'invited' && ' (invited)'}
                        <RemovePlayerButton
                          memberId={m.id}
                          leagueId={id}
                          playerName={displayName}
                        />
                      </span>
                    )
                  })}
                </div>

                <details className="mt-4">
                  <summary className="text-sm font-medium text-blue-600 cursor-pointer hover:text-blue-700 list-none flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Player
                  </summary>
                  <div className="mt-3 pt-3 border-t">
                    <AdminAddMemberForm teamId={team.id} leagueId={id} />
                  </div>
                </details>
              </div>
            )
          })
        ) : (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
            No teams yet. Create one to get started.
          </div>
        )}
      </div>

      <div>
        <AdminCreateTeamForm leagueId={id} />
      </div>
    </div>
  )
}
