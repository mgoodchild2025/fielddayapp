import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { PlayersClient } from '@/components/players/players-client'
import type { PlayerRow, LeagueOption } from '@/components/players/players-client'
import { InvitePlayerButton } from '@/components/players/invite-player-form'

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; unregistered?: string }>
}) {
  const { league: leagueFilter, unregistered } = await searchParams
  const unregisteredOnly = unregistered === '1'
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()
  const scope = await getAdminScope(org.id)

  // For scoped league_admin users: determine which leagues to expose
  const effectiveLeagueIds: string[] | null = !scope.isOrgAdmin && scope.assignedLeagueIds !== null
    ? scope.assignedLeagueIds
    : null // null = all leagues

  const [membersRes, leaguesRes] = await Promise.all([
    supabase
      .from('org_members')
      .select(`
        id, role, status, joined_at, user_id,
        profile:profiles!org_members_user_id_fkey(full_name, email, phone, avatar_url)
      `)
      .eq('organization_id', org.id)
      .neq('status', 'invited')
      .order('joined_at', { ascending: false }),

    // Leagues dropdown: scoped for co-organizers
    effectiveLeagueIds !== null
      ? supabase.from('leagues').select('id, name')
          .eq('organization_id', org.id)
          .in('id', effectiveLeagueIds.length > 0 ? effectiveLeagueIds : ['00000000-0000-0000-0000-000000000000'])
          .order('created_at', { ascending: false })
      : supabase.from('leagues').select('id, name')
          .eq('organization_id', org.id)
          .not('status', 'eq', 'archived')
          .order('created_at', { ascending: false }),
  ])

  let members = membersRes.data ?? []
  const leagues: LeagueOption[] = leaguesRes.data ?? []

  // For scoped co-organizers: restrict to players in their assigned leagues
  if (effectiveLeagueIds !== null) {
    const leagueIds = effectiveLeagueIds.length > 0 ? effectiveLeagueIds : ['00000000-0000-0000-0000-000000000000']
    const { data: regs } = await supabase
      .from('registrations')
      .select('user_id')
      .eq('organization_id', org.id)
      .in('league_id', leagueIds)
    const allowedIds = new Set((regs ?? []).map((r) => r.user_id))
    members = members.filter((m) => m.user_id && allowedIds.has(m.user_id))
  }

  // Server-side league filter (search is handled client-side)
  if (leagueFilter) {
    const { data: regs } = await supabase
      .from('registrations')
      .select('user_id')
      .eq('organization_id', org.id)
      .eq('league_id', leagueFilter)
    const leaguePlayerIds = new Set((regs ?? []).map((r) => r.user_id))
    members = members.filter((m) => m.user_id && leaguePlayerIds.has(m.user_id))
  }

  // Unregistered-only filter: players who have no registrations in this org at all
  if (unregisteredOnly) {
    const { data: anyRegs } = await supabase
      .from('registrations')
      .select('user_id')
      .eq('organization_id', org.id)
    const registeredIds = new Set((anyRegs ?? []).map((r) => r.user_id))
    members = members.filter((m) => !m.user_id || !registeredIds.has(m.user_id))
  }

  const players: PlayerRow[] = members.map((m) => {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
    return {
      memberId: m.id,
      userId: m.user_id ?? null,
      role: m.role,
      status: m.status,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      avatarUrl: (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Players</h1>
        {scope.isOrgAdmin && <InvitePlayerButton orgSlug={org.slug} />}
      </div>

      <PlayersClient
        players={players}
        leagues={leagues}
        currentLeague={leagueFilter ?? null}
        unregisteredOnly={unregisteredOnly}
        isOrgAdmin={scope.isOrgAdmin}
      />
    </div>
  )
}
