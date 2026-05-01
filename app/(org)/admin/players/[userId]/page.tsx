import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { PlayerDetailsForm } from '@/components/players/player-details-form'
import { AddToEventForm } from '@/components/players/add-to-event-form'
import { AddToTeamForm } from '@/components/players/add-to-team-form'
import { TeamRoleSelect } from '@/components/players/team-role-select'
import { SendNotificationForm } from '@/components/players/send-notification-form'
import { CollapsiblePast } from '@/components/players/collapsible-past'
import { removePlayerFromLeague, removePlayerFromTeam } from '@/actions/players'
import { PlayerAvatar } from '@/components/ui/player-avatar'

const PAST_STATUSES = new Set(['completed', 'archived'])

const orgRoleColors: Record<string, string> = {
  org_admin: 'bg-purple-100 text-purple-700',
  league_admin: 'bg-blue-100 text-blue-700',
  captain: 'bg-orange-100 text-orange-700',
  player: 'bg-gray-100 text-gray-600',
}

const regStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  withdrawn: 'bg-red-100 text-red-600',
  waitlisted: 'bg-orange-100 text-orange-700',
}

const leagueStatusColors: Record<string, string> = {
  registration_open: 'bg-green-100 text-green-700',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-gray-100 text-gray-500',
  archived: 'bg-gray-100 text-gray-400',
  draft: 'bg-gray-100 text-gray-400',
}

const leagueStatusLabels: Record<string, string> = {
  registration_open: 'Open',
  active: 'In Season',
  completed: 'Completed',
  archived: 'Archived',
  draft: 'Draft',
}

const paymentStatusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-600',
  manual: 'bg-blue-100 text-blue-700',
  refunded: 'bg-gray-100 text-gray-500',
}

export default async function PlayerManagementPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()
  const scope = await getAdminScope(org.id)
  const isOrgAdmin = scope.isOrgAdmin

  const [
    profileRes,
    orgMemberRes,
    playerDetailsRes,
    registrationsRes,
    teamMembershipsRes,
    leaguesRes,
    teamsRes,
  ] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, sms_opted_in, avatar_url').eq('id', userId).single(),
    supabase
      .from('org_members')
      .select('id, role, status, joined_at')
      .eq('organization_id', org.id)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('player_details')
      .select('skill_level, t_shirt_size, emergency_contact_name, emergency_contact_phone, date_of_birth, how_did_you_hear')
      .eq('organization_id', org.id)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('registrations')
      .select(`
        id, status, created_at, waiver_signature_id, league_id,
        league:leagues!registrations_league_id_fkey(id, name, status),
        payments(id, status, amount_cents, currency, payment_method)
      `)
      .eq('organization_id', org.id)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('team_members')
      .select(`
        id, role,
        team:teams!team_members_team_id_fkey(
          id, name,
          league:leagues!teams_league_id_fkey(id, name, status)
        )
      `)
      .eq('organization_id', org.id)
      .eq('user_id', userId)
      .neq('status', 'inactive'),
    supabase
      .from('leagues')
      .select('id, name, status')
      .eq('organization_id', org.id)
      .not('status', 'eq', 'archived')
      .order('created_at', { ascending: false }),
    supabase
      .from('teams')
      .select('id, name, league_id')
      .eq('organization_id', org.id)
      .eq('status', 'active'),
  ])

  const profile = profileRes.data
  const orgMember = orgMemberRes.data
  if (!profile || !orgMember) notFound()

  const playerDetails = playerDetailsRes.data
  const registrations = registrationsRes.data ?? []
  const teamMemberships = teamMembershipsRes.data ?? []
  const allLeagues = leaguesRes.data ?? []
  const allTeams = teamsRes.data ?? []

  const registeredLeagueIds = new Set(registrations.map((r) => r.league_id).filter(Boolean))
  const availableLeagues = allLeagues.filter((l) => !registeredLeagueIds.has(l.id))

  // Split registrations into active and past by league status
  function regLeagueStatus(reg: (typeof registrations)[number]) {
    const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
    return (league as { status?: string } | null)?.status ?? ''
  }
  const activeRegistrations = registrations.filter((r) => !PAST_STATUSES.has(regLeagueStatus(r)))
  const pastRegistrations = registrations.filter((r) => PAST_STATUSES.has(regLeagueStatus(r)))

  // Split team memberships into active and past by league status
  function teamLeagueStatus(tm: (typeof teamMemberships)[number]) {
    const team = Array.isArray(tm.team) ? tm.team[0] : tm.team
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const league = team ? (Array.isArray((team as any).league) ? (team as any).league[0] : (team as any).league) : null
    return (league as { status?: string } | null)?.status ?? ''
  }
  const activeTeams = teamMemberships.filter((tm) => !PAST_STATUSES.has(teamLeagueStatus(tm)))
  const pastTeams = teamMemberships.filter((tm) => PAST_STATUSES.has(teamLeagueStatus(tm)))

  const inTeamIds = new Set(
    teamMemberships
      .map((tm) => {
        const team = Array.isArray(tm.team) ? tm.team[0] : tm.team
        return team?.id
      })
      .filter(Boolean)
  )

  // Teams available per league (exclude teams the player is already on)
  function teamsForLeague(leagueId: string) {
    return allTeams.filter((t) => t.league_id === leagueId && !inTeamIds.has(t.id))
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/players" className="text-sm text-gray-400 hover:text-gray-600">
          ← Players
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div className="flex items-center gap-4">
            <PlayerAvatar avatarUrl={profile.avatar_url ?? null} name={profile.full_name} size="lg" />
            <div>
              <h1 className="text-2xl font-bold">{profile.full_name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {profile.email}
                {profile.phone ? ` · ${profile.phone}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${orgRoleColors[orgMember.role] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {orgMember.role.replace(/_/g, ' ')}
            </span>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                orgMember.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : orgMember.status === 'suspended'
                  ? 'bg-red-100 text-red-600'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {orgMember.status}
            </span>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex gap-6 mt-4 text-sm text-gray-500">
          <span>
            <span className="font-semibold text-gray-900">{registrations.length}</span>{' '}
            league{registrations.length !== 1 ? 's' : ''}
          </span>
          <span>
            <span className="font-semibold text-gray-900">{teamMemberships.length}</span>{' '}
            team{teamMemberships.length !== 1 ? 's' : ''}
          </span>
          <span>
            Member since{' '}
            {new Date(orgMember.joined_at).toLocaleDateString('en-CA', {
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Player Details */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-base font-semibold mb-4">Player Details</h2>
            {isOrgAdmin ? (
              <PlayerDetailsForm
                userId={userId}
                profile={profile}
                playerDetails={playerDetails}
                orgRole={orgMember.role as 'org_admin' | 'league_admin' | 'captain' | 'player'}
              />
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Name', profile.full_name],
                  ['Email', profile.email],
                  ['Phone', profile.phone ?? '—'],
                  ['Skill Level', playerDetails?.skill_level ?? '—'],
                  ['T-Shirt Size', playerDetails?.t_shirt_size ?? '—'],
                  ['Emergency Contact', playerDetails?.emergency_contact_name ?? '—'],
                  ['Emergency Phone', playerDetails?.emergency_contact_phone ?? '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Leagues */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-base font-semibold mb-4">
              Leagues
              <span className="ml-2 text-sm font-normal text-gray-400">{activeRegistrations.length}</span>
            </h2>

            {activeRegistrations.length > 0 && (
              <div className="divide-y mb-4">
                {activeRegistrations.map((reg) => {
                  const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
                  const payment = Array.isArray(reg.payments) ? reg.payments[0] : reg.payments
                  const availableTeams = teamsForLeague(reg.league_id ?? '')

                  async function removeLeague() {
                    'use server'
                    await removePlayerFromLeague(reg.id, userId)
                  }

                  return (
                    <div key={reg.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{league?.name ?? '—'}</span>
                            {/* League lifecycle status */}
                            {league?.status && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${leagueStatusColors[league.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                {leagueStatusLabels[league.status] ?? league.status}
                              </span>
                            )}
                            {/* Player's registration status — only show if not the default "active" to avoid confusion */}
                            {reg.status !== 'active' && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${regStatusColors[reg.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                {reg.status}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {payment ? (
                              <span
                                className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded font-medium ${paymentStatusColors[payment.status] ?? 'bg-gray-100 text-gray-500'}`}
                              >
                                {payment.status === 'paid' || payment.status === 'manual'
                                  ? `$${(payment.amount_cents / 100).toFixed(0)} ${payment.currency.toUpperCase()} · ${payment.payment_method}`
                                  : payment.status}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">No payment</span>
                            )}
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                reg.waiver_signature_id
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {reg.waiver_signature_id ? 'Waiver signed' : 'No waiver'}
                            </span>
                          </div>

                          {isOrgAdmin && (
                          <AddToTeamForm
                            userId={userId}
                            leagueId={reg.league_id ?? ''}
                            teams={availableTeams}
                          />
                        )}
                        </div>

                        {isOrgAdmin && (
                          <form action={removeLeague}>
                            <button
                              type="submit"
                              className="text-xs text-red-500 hover:text-red-700 shrink-0"
                            >
                              Remove
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {activeRegistrations.length === 0 && pastRegistrations.length === 0 && (
              <p className="text-sm text-gray-400 mb-4">Not registered in any leagues.</p>
            )}

            {/* Past (completed/archived) leagues — hidden until expanded */}
            <CollapsiblePast count={pastRegistrations.length} noun="league">
              <div className="divide-y">
                {pastRegistrations.map((reg) => {
                  const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
                  const payment = Array.isArray(reg.payments) ? reg.payments[0] : reg.payments

                  async function removePastLeague() {
                    'use server'
                    await removePlayerFromLeague(reg.id, userId)
                  }

                  return (
                    <div key={reg.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{league?.name ?? '—'}</span>
                            {(league as { status?: string } | null)?.status && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${leagueStatusColors[(league as { status?: string }).status!] ?? 'bg-gray-100 text-gray-500'}`}>
                                {leagueStatusLabels[(league as { status?: string }).status!] ?? (league as { status?: string }).status}
                              </span>
                            )}
                            {reg.status !== 'active' && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${regStatusColors[reg.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                {reg.status}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {payment ? (
                              <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded font-medium ${paymentStatusColors[payment.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                {payment.status === 'paid' || payment.status === 'manual'
                                  ? `$${(payment.amount_cents / 100).toFixed(0)} ${payment.currency.toUpperCase()} · ${payment.payment_method}`
                                  : payment.status}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">No payment</span>
                            )}
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${reg.waiver_signature_id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {reg.waiver_signature_id ? 'Waiver signed' : 'No waiver'}
                            </span>
                          </div>
                        </div>
                        {isOrgAdmin && (
                          <form action={removePastLeague}>
                            <button type="submit" className="text-xs text-red-500 hover:text-red-700 shrink-0">
                              Remove
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CollapsiblePast>

            {isOrgAdmin && availableLeagues.length > 0 && (
              <AddToEventForm userId={userId} leagues={availableLeagues} />
            )}
          </div>

          {/* Teams */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-base font-semibold mb-4">
              Teams
              <span className="ml-2 text-sm font-normal text-gray-400">{activeTeams.length}</span>
            </h2>

            {activeTeams.length === 0 && pastTeams.length === 0 && (
              <p className="text-sm text-gray-400">Not on any teams.</p>
            )}

            {activeTeams.length > 0 && (
              <div className="divide-y">
                {activeTeams.map((tm) => {
                  const team = Array.isArray(tm.team) ? tm.team[0] : tm.team
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const leagueData = team ? (Array.isArray((team as any).league) ? (team as any).league[0] : (team as any).league) : null

                  async function removeTeam() {
                    'use server'
                    await removePlayerFromTeam(tm.id, userId)
                  }

                  return (
                    <div key={tm.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{team?.name ?? '—'}</p>
                        {leagueData && (
                          <p className="text-xs text-gray-400 mt-0.5">{leagueData.name}</p>
                        )}
                      </div>
                      {isOrgAdmin && (
                        <div className="flex items-center gap-3 shrink-0">
                          <TeamRoleSelect teamMemberId={tm.id} currentRole={tm.role} userId={userId} />
                          <form action={removeTeam}>
                            <button type="submit" className="text-xs text-red-500 hover:text-red-700">Remove</button>
                          </form>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Past teams — hidden until expanded */}
            <CollapsiblePast count={pastTeams.length} noun="team">
              <div className="divide-y">
                {pastTeams.map((tm) => {
                  const team = Array.isArray(tm.team) ? tm.team[0] : tm.team
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const leagueData = team ? (Array.isArray((team as any).league) ? (team as any).league[0] : (team as any).league) : null

                  async function removePastTeam() {
                    'use server'
                    await removePlayerFromTeam(tm.id, userId)
                  }

                  return (
                    <div key={tm.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{team?.name ?? '—'}</p>
                        {leagueData && (
                          <p className="text-xs text-gray-400 mt-0.5">{leagueData.name}</p>
                        )}
                      </div>
                      {isOrgAdmin && (
                        <div className="flex items-center gap-3 shrink-0">
                          <TeamRoleSelect teamMemberId={tm.id} currentRole={tm.role} userId={userId} />
                          <form action={removePastTeam}>
                            <button type="submit" className="text-xs text-red-500 hover:text-red-700">Remove</button>
                          </form>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CollapsiblePast>
          </div>
        </div>

        {/* Right — sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-base font-semibold mb-4">Send Notification</h2>
            <SendNotificationForm
              userId={userId}
              phone={profile.phone ?? null}
              smsOptedIn={profile.sms_opted_in ?? false}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
