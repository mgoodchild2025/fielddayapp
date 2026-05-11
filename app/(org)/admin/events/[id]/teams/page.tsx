import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { getPositionsForSport } from '@/actions/positions'
import { AdminCreateTeamForm } from '@/components/teams/admin-create-team-form'
import { AdminTeamCard } from '@/components/teams/admin-team-card'
import type { ActiveMember, PendingInvite } from '@/components/teams/roster-manager'
import type { RosterNote } from '@/actions/roster-notes'
import { AssignSlotsCard } from '@/components/schedule/assign-slots-card'

export default async function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()
  const scope = await getAdminScope(org.id)
  const isOrgAdmin = scope.isOrgAdmin

  // Fetch team ids first so we can filter join requests and team members
  const { data: teamIds } = await db
    .from('teams')
    .select('id')
    .eq('league_id', id)
    .eq('organization_id', org.id)

  const leagueTeamIds = teamIds?.map((t) => t.id) ?? []

  // Fetch unique slot labels (template games with no team assigned yet)
  const [{ data: homeSlotGames }, { data: awaySlotGames }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('games')
      .select('home_team_label')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .is('home_team_id', null)
      .not('home_team_label', 'is', null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('games')
      .select('away_team_label')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .is('away_team_id', null)
      .not('away_team_label', 'is', null),
  ])
  const slotLabelSet = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(homeSlotGames ?? []).forEach((g: any) => g.home_team_label && slotLabelSet.add(g.home_team_label))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(awaySlotGames ?? []).forEach((g: any) => g.away_team_label && slotLabelSet.add(g.away_team_label))
  const slotLabels = Array.from(slotLabelSet).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  )

  // Parallel data fetch — league meta + teams + join requests + registrations + invitations
  const [
    { data: league },
    { data: teams },
    { data: joinRequests },
    { data: registrations },
    { data: assignedMembers },
    { data: waiverDef },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { data: pendingInvites } ,
  ] = await Promise.all([
    // League slug + sport for invite URLs and positions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('leagues')
      .select('slug, sport')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
    // Teams with full member roster + positions + avatars
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('teams')
      .select(`
        id, name, color, logo_url, team_code, created_at,
        team_members(
          id, role, status, user_id, position,
          profile:profiles!team_members_user_id_fkey(full_name, email, avatar_url)
        )
      `)
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('created_at', { ascending: true }),
    // Pending join requests across all league teams
    leagueTeamIds.length > 0
      ? db
          .from('team_join_requests')
          .select(`
            id, message, created_at, team_id,
            profile:profiles!team_join_requests_user_id_fkey(full_name, email)
          `)
          .eq('organization_id', org.id)
          .eq('status', 'pending')
          .in('team_id', leagueTeamIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{
          id: string; message: string | null; created_at: string; team_id: string;
          profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null
        }>, error: null }),
    // All player registrations for this event
    db
      .from('registrations')
      .select('user_id, profiles!registrations_user_id_fkey(full_name, email)')
      .eq('league_id', id)
      .eq('organization_id', org.id),
    // All user_ids currently assigned to any team in this event
    leagueTeamIds.length > 0
      ? db.from('team_members').select('user_id').in('team_id', leagueTeamIds)
      : Promise.resolve({ data: [] as { user_id: string | null }[], error: null }),
    // Check if org has an active waiver
    db.from('waivers').select('id').eq('organization_id', org.id).eq('is_active', true).maybeSingle(),
    // Pending email invitations for all league teams
    leagueTeamIds.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (db as any)
          .from('team_invitations')
          .select('id, team_id, invited_email, role, created_at, expires_at, invited_by')
          .eq('organization_id', org.id)
          .eq('status', 'pending')
          .in('team_id', leagueTeamIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{
          id: string; team_id: string; invited_email: string; role: string;
          created_at: string; expires_at: string; invited_by: string
        }>, error: null }),
  ])

  const leagueSlug: string = (league as { slug?: string } | null)?.slug ?? ''
  const leagueSport: string = (league as { sport?: string } | null)?.sport ?? ''
  const leagueHasWaiver = !!(waiverDef as { id?: string } | null)?.id

  // Positions for this sport
  const positions = await getPositionsForSport(org.id, leagueSport)

  // Collect all active member user_ids to batch-fetch waiver signatures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedTeams = (teams ?? []) as any[]
  const allMemberUserIds: string[] = []
  for (const team of typedTeams) {
    for (const m of team.team_members ?? []) {
      if (m.user_id && m.status === 'active') allMemberUserIds.push(m.user_id)
    }
  }
  const uniqueMemberUserIds = [...new Set(allMemberUserIds)]

  // Waiver signatures + registrations for all active members
  const [waiverSigsResult, regStatusResult] = uniqueMemberUserIds.length > 0
    ? await Promise.all([
        db.from('waiver_signatures')
          .select('user_id')
          .eq('organization_id', org.id)
          .in('user_id', uniqueMemberUserIds),
        db.from('registrations')
          .select('user_id, status')
          .eq('league_id', id)
          .eq('organization_id', org.id)
          .in('user_id', uniqueMemberUserIds),
      ])
    : [{ data: [] }, { data: [] }]

  const signedUserIds = new Set(
    ((waiverSigsResult as { data: Array<{ user_id: string }> | null }).data ?? []).map((s) => s.user_id)
  )
  const regByUser = Object.fromEntries(
    ((regStatusResult as { data: Array<{ user_id: string; status: string }> | null }).data ?? [])
      .map((r) => [r.user_id, r.status])
  )

  // Players registered but not yet on any team — for AdminCreateTeamForm
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

  // Roster notes — fetch all for this league's teams in one query
  const rosterNotesByTeam = new Map<string, RosterNote[]>()
  if (leagueTeamIds.length > 0) {
    const { data: allNotes } = await db
      .from('roster_notes' as never)
      .select('id, team_id, name, email, note, created_at')
      .eq('organization_id', org.id)
      .in('team_id', leagueTeamIds as never)
      .order('created_at', { ascending: true })
      .returns<(RosterNote & { team_id: string })[]>()
    for (const note of (allNotes ?? []) as (RosterNote & { team_id: string })[]) {
      if (!rosterNotesByTeam.has(note.team_id)) rosterNotesByTeam.set(note.team_id, [])
      rosterNotesByTeam.get(note.team_id)!.push(note)
    }
  }

  // Group invites and join requests by team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invitesByTeam = new Map<string, any[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const inv of (pendingInvites ?? []) as any[]) {
    if (!invitesByTeam.has(inv.team_id)) invitesByTeam.set(inv.team_id, [])
    invitesByTeam.get(inv.team_id)!.push(inv)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joinRequestsByTeam = new Map<string, any[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const req of (joinRequests ?? []) as any[]) {
    if (!joinRequestsByTeam.has(req.team_id)) joinRequestsByTeam.set(req.team_id, [])
    joinRequestsByTeam.get(req.team_id)!.push(req)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-2">
        {typedTeams.length > 0 ? (
          typedTeams.map((team) => {
            const allMembers = (team.team_members ?? []) as Array<{
              id: string; role: string; status: string; user_id: string | null; position: string | null;
              profile: { full_name: string; email: string; avatar_url: string | null } | { full_name: string; email: string; avatar_url: string | null }[] | null
            }>
            const activeMembers = allMembers.filter((m) => m.status === 'active')
            const captain = activeMembers.find((m) => m.role === 'captain')
            const captainProfile = captain
              ? (Array.isArray(captain.profile) ? captain.profile[0] : captain.profile)
              : null

            const initialMembers: ActiveMember[] = activeMembers.map((m) => {
              const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
              const regStatus = m.user_id
                ? (regByUser[m.user_id] as 'active' | 'pending' | undefined) ?? 'none'
                : 'none'
              const waiverStatus = !leagueHasWaiver
                ? 'not_required'
                : m.user_id && signedUserIds.has(m.user_id)
                ? 'signed'
                : 'not_signed'
              return {
                id: m.id,
                role: m.role,
                position: m.position ?? null,
                userId: m.user_id,
                isMe: false,
                name: profile?.full_name ?? '',
                email: profile?.email ?? '',
                avatarUrl: profile?.avatar_url ?? null,
                registrationStatus: regStatus,
                waiverStatus,
              }
            })

            const teamInvites = invitesByTeam.get(team.id) ?? []
            const initialInvites: PendingInvite[] = teamInvites.map((inv) => ({
              id: inv.id,
              invitedEmail: inv.invited_email,
              role: inv.role,
              invitedAt: inv.created_at,
              expiresAt: inv.expires_at,
              inviterName: null,
            }))

            const teamJoinRequests = (joinRequestsByTeam.get(team.id) ?? []).map((req) => {
              const profile = Array.isArray(req.profile) ? req.profile[0] : req.profile
              return {
                id: req.id,
                playerName: (profile as { full_name?: string } | null)?.full_name ?? '',
                playerEmail: (profile as { email?: string } | null)?.email ?? '',
                message: req.message ?? null,
                createdAt: req.created_at,
              }
            })

            return (
              <AdminTeamCard
                key={team.id}
                leagueId={id}
                leagueSlug={leagueSlug}
                leagueHasWaiver={leagueHasWaiver}
                positions={positions}
                isOrgAdmin={isOrgAdmin}
                team={{
                  id: team.id,
                  name: team.name,
                  color: team.color ?? null,
                  logo_url: team.logo_url ?? null,
                  team_code: team.team_code ?? null,
                }}
                captainName={captainProfile?.full_name ?? null}
                initialMembers={initialMembers}
                initialInvites={initialInvites}
                joinRequests={teamJoinRequests}
                rosterNotes={rosterNotesByTeam.get(team.id) ?? []}
              />
            )
          })
        ) : (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
            No teams yet. Create one to get started.
          </div>
        )}
      </div>

      {/* Sidebar */}
      {isOrgAdmin && (
        <div className="space-y-4">
          <AdminCreateTeamForm leagueId={id} registeredPlayers={unassignedPlayers} slotLabels={slotLabels} />
          {slotLabels.length > 0 && (
            <AssignSlotsCard
              leagueId={id}
              slotLabels={slotLabels}
              teams={(typedTeams as Array<{ id: string; name: string }>).map((t) => ({ id: t.id, name: t.name }))}
            />
          )}
        </div>
      )}
    </div>
  )
}
