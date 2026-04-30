import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { PlayerDetailsForm } from '@/components/players/player-details-form'
import { AddToEventForm } from '@/components/players/add-to-event-form'
import { AddToTeamForm } from '@/components/players/add-to-team-form'
import { TeamRoleSelect } from '@/components/players/team-role-select'
import { SendNotificationForm } from '@/components/players/send-notification-form'
import { removePlayerFromLeague, removePlayerFromTeam } from '@/actions/players'
import { PlayerAvatar } from '@/components/ui/player-avatar'

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
        league:leagues!registrations_league_id_fkey(id, name),
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
          league:leagues!teams_league_id_fkey(id, name)
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
        <Link href="/admin/users" className="text-sm text-gray-400 hover:text-gray-600">
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
            <PlayerDetailsForm
              userId={userId}
              profile={profile}
              playerDetails={playerDetails}
              orgRole={orgMember.role as 'org_admin' | 'league_admin' | 'captain' | 'player'}
            />
          </div>

          {/* Leagues */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-base font-semibold mb-4">
              Leagues
              <span className="ml-2 text-sm font-normal text-gray-400">{registrations.length}</span>
            </h2>

            {registrations.length > 0 && (
              <div className="divide-y mb-4">
                {registrations.map((reg) => {
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
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs font-medium ${regStatusColors[reg.status] ?? 'bg-gray-100 text-gray-500'}`}
                            >
                              {reg.status}
                            </span>
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

                          <AddToTeamForm
                            userId={userId}
                            leagueId={reg.league_id ?? ''}
                            teams={availableTeams}
                          />
                        </div>

                        <form action={removeLeague}>
                          <button
                            type="submit"
                            className="text-xs text-red-500 hover:text-red-700 shrink-0"
                          >
                            Remove
                          </button>
                        </form>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {registrations.length === 0 && (
              <p className="text-sm text-gray-400 mb-4">Not registered in any leagues.</p>
            )}

            {availableLeagues.length > 0 && (
              <AddToEventForm userId={userId} leagues={availableLeagues} />
            )}
          </div>

          {/* Teams */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-base font-semibold mb-4">
              Teams
              <span className="ml-2 text-sm font-normal text-gray-400">{teamMemberships.length}</span>
            </h2>

            {teamMemberships.length > 0 ? (
              <div className="divide-y">
                {teamMemberships.map((tm) => {
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
                      <div className="flex items-center gap-3 shrink-0">
                        <TeamRoleSelect
                          teamMemberId={tm.id}
                          currentRole={tm.role}
                          userId={userId}
                        />
                        <form action={removeTeam}>
                          <button
                            type="submit"
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </form>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Not on any teams.</p>
            )}
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
