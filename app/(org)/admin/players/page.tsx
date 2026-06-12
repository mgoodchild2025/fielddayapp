import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { getMarketingConsentBatch } from '@/actions/player-consents'
import { PlayersClient } from '@/components/players/players-client'
import type { PlayerRow, LeagueOption } from '@/components/players/players-client'
import { InvitePlayerButton } from '@/components/players/invite-player-form'
import { PlayersHelpModal } from '@/components/admin/players-help-modal'

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
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  const currentUserId = user?.id ?? null

  // For scoped league_admin users: determine which leagues to expose
  const effectiveLeagueIds: string[] | null = !scope.isOrgAdmin && scope.assignedLeagueIds !== null
    ? scope.assignedLeagueIds
    : null // null = all leagues

  const [membersRes, leaguesRes] = await Promise.all([
    supabase
      .from('org_members')
      .select(`
        id, role, status, joined_at, user_id,
        profile:profiles!org_members_user_id_fkey(full_name, email, phone, avatar_url, sms_opted_in, email_reminders_enabled)
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

  // Commercial (marketing_sms) consent per player, for the SMS status column.
  const memberUserIds = members.map((m) => m.user_id).filter(Boolean) as string[]
  const promoConsent = await getMarketingConsentBatch(org.id, memberUserIds)

  const players: PlayerRow[] = members.map((m) => {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
    const phone = profile?.phone ?? null
    return {
      memberId: m.id,
      userId: m.user_id ?? null,
      role: m.role,
      status: m.status,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      phone,
      avatarUrl: (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
      // Transactional SMS reachable = opted in AND has a phone on file.
      smsTransactional: !!phone && (profile as { sms_opted_in?: boolean } | null)?.sms_opted_in === true,
      // Commercial SMS = explicit marketing_sms consent for this org.
      smsPromo: !!m.user_id && promoConsent.sms.has(m.user_id),
      // Transactional email = reminders not disabled AND has an email on file.
      emailTransactional: !!profile?.email && (profile as { email_reminders_enabled?: boolean } | null)?.email_reminders_enabled !== false,
      // Commercial email = explicit marketing_email consent for this org.
      emailPromo: !!m.user_id && promoConsent.email.has(m.user_id),
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Players</h1>
          {scope.isOrgAdmin && <PlayersHelpModal />}
        </div>
        {scope.isOrgAdmin && <InvitePlayerButton orgSlug={org.slug} />}
      </div>

      <PlayersClient
        players={players}
        leagues={leagues}
        currentLeague={leagueFilter ?? null}
        unregisteredOnly={unregisteredOnly}
        isOrgAdmin={scope.isOrgAdmin}
        currentUserId={currentUserId}
      />
    </div>
  )
}
