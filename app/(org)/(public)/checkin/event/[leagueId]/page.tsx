import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { SelfCheckinClient } from '@/components/checkin/self-checkin-client'

export default async function SelfCheckInEventPage({
  params,
}: {
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/checkin/event/${leagueId}`)
  }

  const db = createServiceRoleClient()

  const [{ data: branding }, { data: league }, { data: profile }, { data: captainRows }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone, checkin_sound').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, name').eq('id', leagueId).eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    // Check if the user is a captain/coach for any team in this org
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('team_members')
      .select('team_id, team:teams!team_members_team_id_fkey(id, name, league_id)')
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .in('role', ['captain', 'coach']),
  ])

  const playerName: string = profile?.full_name ?? 'You'
  const timezone = branding?.timezone ?? 'America/Toronto'
  const checkinSound: string | null = branding?.checkin_sound ?? null

  if (!league) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-semibold text-gray-800">Event not found</h1>
            <p className="text-gray-500 text-sm">This check-in link may be invalid.</p>
          </div>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  // Determine if user is captain of a team in this league
  let captainTeamId: string | null = null
  let captainTeamName: string | null = null
  for (const row of (captainRows ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = Array.isArray(row.team) ? row.team[0] : row.team as any
    if (team?.league_id === leagueId) {
      captainTeamId = team.id
      captainTeamName = team.name
      break
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <SelfCheckinClient
          leagueId={leagueId}
          leagueName={league.name}
          playerName={playerName}
          timezone={timezone}
          checkinSound={checkinSound}
          captainTeamId={captainTeamId}
          captainTeamName={captainTeamName}
        />
      </div>

      <Footer org={org} />
    </div>
  )
}
