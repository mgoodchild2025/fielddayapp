import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { DeletePlayerButton } from '@/components/players/delete-player-button'
import { PlayerAvatar } from '@/components/ui/player-avatar'

const roleColors: Record<string, string> = {
  org_admin: 'bg-purple-100 text-purple-700',
  league_admin: 'bg-blue-100 text-blue-700',
  captain: 'bg-orange-100 text-orange-700',
  player: 'bg-gray-100 text-gray-600',
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; league?: string }>
}) {
  const { q, league: leagueFilter } = await searchParams
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
      ? supabase.from('leagues').select('id, name').eq('organization_id', org.id).in('id', effectiveLeagueIds.length > 0 ? effectiveLeagueIds : ['00000000-0000-0000-0000-000000000000']).order('created_at', { ascending: false })
      : supabase.from('leagues').select('id, name').eq('organization_id', org.id).not('status', 'eq', 'archived').order('created_at', { ascending: false }),
  ])

  let members = membersRes.data ?? []
  const leagues = leaguesRes.data ?? []

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

  // Filter by league membership if requested
  let leaguePlayerIds: Set<string> | null = null
  if (leagueFilter) {
    const { data: regs } = await supabase
      .from('registrations')
      .select('user_id')
      .eq('organization_id', org.id)
      .eq('league_id', leagueFilter)
    leaguePlayerIds = new Set((regs ?? []).map((r) => r.user_id))
  }

  if (leaguePlayerIds) {
    members = members.filter((m) => m.user_id && leaguePlayerIds!.has(m.user_id))
  }

  if (q) {
    const lower = q.toLowerCase()
    members = members.filter((m) => {
      const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
      return (
        profile?.full_name?.toLowerCase().includes(lower) ||
        profile?.email?.toLowerCase().includes(lower)
      )
    })
  }

  const activeCount = members.filter((m) => m.status === 'active').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Players</h1>
          <p className="text-sm text-gray-500 mt-1">{activeCount} active</p>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 mb-6">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search name or email…"
          className="border border-gray-200 rounded-md px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
        <select
          name="league"
          defaultValue={leagueFilter ?? ''}
          className="border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        >
          <option value="">All leagues</option>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Filter
        </button>
        {(q || leagueFilter) && (
          <Link
            href="/admin/players"
            className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
                return (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar
                          avatarUrl={(profile as { avatar_url?: string | null } | null)?.avatar_url ?? null}
                          name={profile?.full_name ?? '?'}
                          size="sm"
                        />
                        {m.user_id ? (
                          <Link href={`/admin/players/${m.user_id}`} className="hover:underline" style={{ color: 'var(--brand-primary)' }}>
                            {profile?.full_name ?? '—'}
                          </Link>
                        ) : (profile?.full_name ?? '—')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{profile?.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {m.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.user_id && (
                        <span className="flex items-center gap-1">
                          <Link
                            href={`/admin/players/${m.user_id}`}
                            className="text-xs font-medium hover:underline"
                            style={{ color: 'var(--brand-primary)' }}
                          >
                            Manage →
                          </Link>
                          <DeletePlayerButton
                            userId={m.user_id}
                            name={(() => { const p = Array.isArray(m.profile) ? m.profile[0] : m.profile; return p?.full_name ?? p?.email ?? 'this player' })()}
                          />
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    No players found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
