import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { QRScanner } from '@/components/checkin/qr-scanner'
import { CheckInList } from '@/components/checkin/checkin-list'

export default async function AdminCheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('id, name, event_type')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!league) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: registrations } = await (db as any)
    .from('registrations')
    .select(`
      id, checked_in_at, checkin_token, user_id,
      user_profile:profiles!registrations_user_id_fkey(full_name)
    `)
    .eq('league_id', id)
    .eq('organization_id', org.id)
    .eq('status', 'active')
    .order('checked_in_at', { ascending: false, nullsFirst: false })

  // Fetch team names separately — no direct FK from registrations to team_members
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: teamMembers } = await (db as any)
    .from('team_members')
    .select('user_id, team:teams!team_members_team_id_fkey(name, league_id)')
    .eq('status', 'active')
    .in('user_id', (registrations ?? []).map((r: { user_id: string }) => r.user_id))

  const teamByUserId = new Map<string, string>()
  for (const tm of (teamMembers ?? [])) {
    const team = Array.isArray(tm.team) ? tm.team[0] : tm.team
    if (team?.league_id === id) teamByUserId.set(tm.user_id, team.name)
  }

  const rows = (registrations ?? []).map((reg: {
    id: string
    checked_in_at: string | null
    checkin_token: string
    user_id: string
    user_profile: { full_name: string } | { full_name: string }[] | null
  }) => {
    const profile = Array.isArray(reg.user_profile) ? reg.user_profile[0] : reg.user_profile
    return {
      id: reg.id,
      playerName: profile?.full_name ?? 'Unknown',
      teamName: teamByUserId.get(reg.user_id) ?? null,
      checkinToken: reg.checkin_token,
      checkedInAt: reg.checked_in_at,
    }
  })

  // Sort: not-checked-in first, then checked-in alphabetically
  rows.sort((a: { checkedInAt: string | null; playerName: string }, b: { checkedInAt: string | null; playerName: string }) => {
    if (!a.checkedInAt && b.checkedInAt) return -1
    if (a.checkedInAt && !b.checkedInAt) return 1
    return a.playerName.localeCompare(b.playerName)
  })

  return (
    <div className="space-y-8">
      {/* Scanner section */}
      <div>
        <h2 className="text-base font-semibold mb-4">Scan Player QR Code</h2>
        <div className="max-w-sm">
          <QRScanner leagueId={id} />
        </div>
      </div>

      {/* Roster list */}
      <div>
        <h2 className="text-base font-semibold mb-4">Player Roster</h2>
        <CheckInList registrations={rows} leagueId={id} />
      </div>
    </div>
  )
}
