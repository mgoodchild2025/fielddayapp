import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { PendingPaymentButton } from '@/components/dashboard/pending-payment-button'
import { TeamMessageForm } from '@/components/teams/team-message-form'
import { QRCodeDisplay } from '@/components/checkin/qr-code-display'
import { formatGameTime } from '@/lib/format-time'
import Link from 'next/link'

export default async function PlayerDashboardPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: branding },
    { data: registrations },
    { data: upcomingGames },
    { data: myTeams },
  ] = await Promise.all([
    supabase.from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('registrations').select(`
      id, status, created_at, checkin_token,
      waiver_signature_id,
      league:leagues!registrations_league_id_fkey(id, name, slug, status, price_cents, currency, waiver_version_id, event_type),
      payment:payments!payments_registration_id_fkey(id, status, amount_cents, currency)
    `).eq('organization_id', org.id).eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('games').select(`
      id, scheduled_at, court,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      league:leagues!games_league_id_fkey(name)
    `).eq('organization_id', org.id)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5),
    // My team memberships
    supabase.from('team_members').select(`
      id, role,
      team:teams!team_members_team_id_fkey(
        id, name, color, league_id,
        league:leagues!teams_league_id_fkey(id, name, slug),
        team_members(
          id, role, status,
          profile:profiles!team_members_user_id_fkey(full_name, email, phone)
        )
      )
    `).eq('organization_id', org.id).eq('user_id', user.id).eq('status', 'active'),
  ])

  const timezone = branding?.timezone ?? 'America/Toronto'

  // Fetch the org-wide active waiver id once (used as fallback when league has no specific waiver)
  const { data: orgActiveWaiver } = await supabase
    .from('waivers')
    .select('id')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .single()

  // Determine pending actions across all registrations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingActions = (registrations ?? []).filter((reg: any) => {
    const payment = Array.isArray(reg.payment) ? reg.payment[0] : reg.payment
    const waiverSigned = !!reg.waiver_signature_id
    const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
    const leagueRequiresWaiver = !!(league?.waiver_version_id ?? orgActiveWaiver?.id)
    const needsPayment = payment && payment.status !== 'paid'
    const needsWaiver = leagueRequiresWaiver && !waiverSigned && reg.status !== 'active'
    return needsPayment || needsWaiver
  })

  // Filter upcoming games to only ones for my teams
  const myTeamIds = new Set(
    (myTeams ?? []).map((mt) => {
      const team = Array.isArray(mt.team) ? mt.team[0] : mt.team
      return team?.id
    }).filter(Boolean)
  )

  const myGames = (upcomingGames ?? []).filter((g) => {
    const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
    const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
    return myTeamIds.has(homeTeam?.id) || myTeamIds.has(awayTeam?.id)
  })

  // Use all upcoming games if no team membership
  const gamesToShow = myTeamIds.size > 0 ? myGames : (upcomingGames ?? []).slice(0, 3)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="text-3xl font-bold uppercase mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          My Dashboard
        </h1>

        {/* Pending actions banner */}
        {pendingActions.length > 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              ⚠️ Action required on {pendingActions.length === 1 ? '1 registration' : `${pendingActions.length} registrations`}
            </p>
            <p className="text-xs text-amber-700">Complete the steps below to finish your registration.</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Registrations */}
          <div className="bg-white rounded-lg border p-5">
            <h2 className="font-semibold mb-4">My Events</h2>
            <div className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {registrations?.map((reg: any) => {
                const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
                const payment = Array.isArray(reg.payment) ? reg.payment[0] : reg.payment
                const waiverSigned = !!reg.waiver_signature_id
                const leagueRequiresWaiver = !!(league?.waiver_version_id ?? orgActiveWaiver?.id)

                const needsWaiver = leagueRequiresWaiver && !waiverSigned && reg.status !== 'active'
                const needsPayment = payment && payment.status !== 'paid'
                const isComplete = reg.status === 'active' && !needsPayment

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const checkinToken = (reg as any).checkin_token as string | null
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const eventType = (league as any)?.event_type as string | undefined
                const showQR = isComplete && checkinToken && (eventType === 'tournament' || eventType === 'league')
                const host = headersList.get('host') ?? ''
                const protocol = host.startsWith('localhost') ? 'http' : 'https'
                const checkinUrl = checkinToken ? `${protocol}://${host}/checkin/${checkinToken}` : null

                return (
                  <div key={reg.id} className={`border rounded-md p-3 ${(needsWaiver || needsPayment) ? 'border-amber-200 bg-amber-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/events/${league?.slug ?? ''}`}
                        className="font-medium hover:underline"
                        style={{ color: 'var(--brand-primary)' }}
                      >
                        {league?.name ?? '—'}
                      </Link>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        isComplete ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {isComplete ? 'Active' : reg.status}
                      </span>
                    </div>

                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      {payment && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          payment.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {payment.status === 'paid' ? '✓ Paid' : 'Payment pending'}
                        </span>
                      )}
                      {leagueRequiresWaiver && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          waiverSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {waiverSigned ? '✓ Waiver signed' : 'Waiver pending'}
                        </span>
                      )}
                    </div>

                    {showQR && checkinUrl && (
                      <div className="mt-2">
                        <QRCodeDisplay
                          checkinUrl={checkinUrl}
                          playerName=""
                          eventName={league?.name ?? ''}
                          size={140}
                        />
                      </div>
                    )}

                    {needsWaiver && league?.slug && (
                      <Link
                        href={`/register/${league.slug}`}
                        className="mt-2 block w-full py-2 px-3 rounded-md text-sm font-semibold text-center border-2 hover:bg-amber-50 transition-colors"
                        style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}
                      >
                        Sign Waiver →
                      </Link>
                    )}
                    {needsPayment && !needsWaiver && league?.slug && (
                      <PendingPaymentButton
                        leagueId={league.id}
                        leagueSlug={league.slug}
                        registrationId={reg.id}
                        orgId={org.id}
                        userId={user.id}
                        amountCents={payment.amount_cents}
                        currency={payment.currency}
                      />
                    )}
                  </div>
                )
              })}
              {(!registrations || registrations.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">You haven&apos;t registered for any leagues yet.</p>
              )}
            </div>
            <Link href="/events" className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Browse leagues →
            </Link>
          </div>

          {/* Upcoming Games */}
          <div className="bg-white rounded-lg border p-5">
            <h2 className="font-semibold mb-4">
              {myTeamIds.size > 0 ? 'My Upcoming Games' : 'Upcoming Games'}
            </h2>
            <div className="space-y-3">
              {gamesToShow.map((g) => {
                const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
                const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
                const league = Array.isArray(g.league) ? g.league[0] : g.league
                const { date: gameDate, time: gameTime } = formatGameTime(g.scheduled_at, timezone)
                return (
                  <div key={g.id} className="border rounded-md p-3">
                    <p className="text-sm text-gray-500">
                      {gameDate} · {gameTime}
                      {g.court ? ` · Court ${g.court}` : ''}
                    </p>
                    <p className="font-medium mt-0.5">{homeTeam?.name ?? 'TBD'} vs {awayTeam?.name ?? 'TBD'}</p>
                    <p className="text-xs text-gray-400">{(league as { name?: string } | null)?.name}</p>
                  </div>
                )
              })}
              {gamesToShow.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No upcoming games.</p>
              )}
            </div>
            <Link href="/schedule" className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Full schedule →
            </Link>
          </div>
        </div>

        {/* My Teams */}
        {myTeams && myTeams.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-4">My Teams</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myTeams.map((mt) => {
                const team = Array.isArray(mt.team) ? mt.team[0] : mt.team
                if (!team) return null
                const league = Array.isArray(team.league) ? team.league[0] : team.league
                const members = (team.team_members ?? []) as Array<{
                  id: string; role: string; status: string
                  profile: { full_name: string; email: string; phone: string | null } | { full_name: string; email: string; phone: string | null }[] | null
                }>
                const activeMembers = members.filter((m) => m.status === 'active')
                const captain = activeMembers.find((m) => m.role === 'captain')
                const captainProfile = Array.isArray(captain?.profile) ? captain?.profile[0] : captain?.profile
                const isCaptain = mt.role === 'captain'

                return (
                  <div key={mt.id} className="bg-white rounded-lg border p-5">
                    <div className="flex items-center gap-2 mb-2">
                      {team.color && (
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                      )}
                      <Link
                        href={`/teams/${team.id}`}
                        className="font-semibold hover:underline"
                        style={{ color: 'var(--brand-primary)' }}
                      >
                        {team.name}
                      </Link>
                      {isCaptain && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Captain</span>
                      )}
                    </div>
                    {league && (
                      <p className="text-xs text-gray-500 mb-3">
                        League: <span className="font-medium text-gray-700">{(league as { name?: string }).name}</span>
                      </p>
                    )}

                    {/* Team roster */}
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Roster ({activeMembers.length} players)
                    </p>
                    <div className="space-y-1.5">
                      {activeMembers.map((m) => {
                        const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
                        return (
                          <div key={m.id} className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-sm font-medium">{profile?.full_name ?? '—'}</span>
                              {m.role === 'captain' && (
                                <span className="ml-1.5 text-xs text-blue-600">Captain</span>
                              )}
                            </div>
                            {/* Show contact info to captain/admin */}
                            {isCaptain && profile?.email && (
                              <a href={`mailto:${profile.email}`} className="text-xs text-gray-400 hover:text-blue-600 transition-colors">
                                {profile.email}
                              </a>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Captain contact (for non-captains) */}
                    {!isCaptain && captainProfile && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-gray-500">
                          Captain: <span className="font-medium text-gray-700">{captainProfile.full_name}</span>
                          {captainProfile.email && (
                            <a href={`mailto:${captainProfile.email}`} className="ml-2 text-blue-600 hover:underline">
                              {captainProfile.email}
                            </a>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Captain: message the whole team */}
                    {isCaptain && activeMembers.length > 1 && (
                      <TeamMessageForm teamId={team.id} memberCount={activeMembers.length} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
