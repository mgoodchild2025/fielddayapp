import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { AdminCreateTeamForm } from '@/components/teams/admin-create-team-form'
import { AdminAddMemberForm } from '@/components/teams/admin-add-member-form'
import { TeamCodeBadge } from '@/components/teams/team-code-badge'
import { RemovePlayerButton } from '@/components/teams/remove-player-button'
import { DeleteTeamButton } from '@/components/teams/delete-team-button'
import { JoinRequestButtons } from '@/components/teams/join-request-buttons'
import { AdminEditTeamForm } from '@/components/teams/admin-edit-team-form'
import { MakeCaptainButton } from '@/components/teams/make-captain-button'

export default async function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  // Fetch team ids first so we can filter join requests and team members
  const { data: teamIds } = await db
    .from('teams')
    .select('id')
    .eq('league_id', id)
    .eq('organization_id', org.id)

  const leagueTeamIds = teamIds?.map((t) => t.id) ?? []

  const [{ data: teams }, { data: joinRequests }, { data: registrations }, { data: assignedMembers }] =
    await Promise.all([
      supabase
        .from('teams')
        .select(`
          id, name, color, logo_url, team_code, created_at,
          team_members(
            id, role, status, user_id, invited_email,
            profiles!team_members_user_id_fkey(full_name)
          )
        `)
        .eq('league_id', id)
        .eq('organization_id', org.id)
        .order('created_at', { ascending: true }),
      db
        .from('team_join_requests')
        .select(`
          id, message, created_at,
          team:teams!team_join_requests_team_id_fkey(id, name),
          requester:profiles!team_join_requests_user_id_fkey(full_name, email)
        `)
        .eq('organization_id', org.id)
        .eq('status', 'pending')
        .in('team_id', leagueTeamIds)
        .order('created_at', { ascending: false }),
      // All players registered for this event
      db
        .from('registrations')
        .select('user_id, profiles!registrations_user_id_fkey(full_name, email)')
        .eq('league_id', id)
        .eq('organization_id', org.id),
      // All user_ids currently assigned to any team in this event
      leagueTeamIds.length > 0
        ? db.from('team_members').select('user_id').in('team_id', leagueTeamIds)
        : Promise.resolve({ data: [] as { user_id: string | null }[], error: null }),
    ])

  const pendingRequests = joinRequests ?? []

  // Players registered for the league but not yet on any team
  const assignedUserIds = new Set((assignedMembers ?? []).map((m) => m.user_id).filter(Boolean))
  const unassignedPlayers = (registrations ?? [])
    .filter((r) => r.user_id && !assignedUserIds.has(r.user_id))
    .map((r) => {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return {
        userId: r.user_id!,
        name: profile?.full_name ?? '—',
        email: (profile as { email?: string } | null)?.email ?? '',
      }
    })

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Pending join requests banner */}
      {pendingRequests.length > 0 && (
        <div className="md:col-span-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-amber-800 mb-3">
            {pendingRequests.length} pending join request{pendingRequests.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {pendingRequests.map((req) => {
              type ReqRow = typeof req & {
                team: { id: string; name: string } | { id: string; name: string }[] | null
                requester: { full_name: string; email: string } | { full_name: string; email: string }[] | null
              }
              const r = req as ReqRow
              const team = Array.isArray(r.team) ? r.team[0] : r.team
              const requester = Array.isArray(r.requester) ? r.requester[0] : r.requester
              return (
                <div key={req.id} className="flex items-center justify-between gap-4 bg-white rounded border p-3">
                  <div>
                    <p className="text-sm font-medium">{requester?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{requester?.email ?? ''} · wants to join {team?.name ?? '—'}</p>
                    {req.message && <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{req.message}&rdquo;</p>}
                  </div>
                  <JoinRequestButtons requestId={req.id} />
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                  {/* Logo or colour dot */}
                  {team.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={team.logo_url} alt="" className="w-7 h-7 rounded object-contain flex-shrink-0 bg-gray-50 border" />
                  ) : team.color ? (
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                  ) : null}
                  <h3 className="font-semibold">{team.name}</h3>
                  <span className="text-xs text-gray-400 ml-auto">
                    {activePlayers.length} player{activePlayers.length !== 1 ? 's' : ''}
                  </span>
                  <AdminEditTeamForm
                    team={{ id: team.id, name: team.name, color: team.color, logo_url: team.logo_url ?? null }}
                    leagueId={id}
                  />
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
                        {m.role !== 'captain' && m.status === 'active' && m.user_id && (
                          <MakeCaptainButton
                            memberId={m.id}
                            teamId={team.id}
                            leagueId={id}
                            playerName={displayName}
                          />
                        )}
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
                    <AdminAddMemberForm
                      teamId={team.id}
                      leagueId={id}
                      registeredPlayers={unassignedPlayers}
                    />
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
        <AdminCreateTeamForm leagueId={id} registeredPlayers={unassignedPlayers} />
      </div>
    </div>
  )
}
