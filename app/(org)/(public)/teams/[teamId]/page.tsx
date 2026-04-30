import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { TeamMessageForm } from '@/components/teams/team-message-form'
import { CaptainRosterManager } from '@/components/teams/captain-roster-manager'
import { AdminEditTeamForm } from '@/components/teams/admin-edit-team-form'
import { PendingJoinRequests } from '@/components/teams/pending-join-requests'
import { TeamPaymentPanel } from '@/components/teams/team-payment-panel'
import { getPositionsForSport } from '@/actions/positions'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import Link from 'next/link'

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ payment?: string }>
}) {
  const { teamId } = await params
  const { payment: paymentResult } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceRoleClient()

  const [{ data: branding }, { data: team }, { data: myMembership }, { data: orgMember }, { data: joinRequests }, { data: orgBranding }] = await Promise.all([
    supabase.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    db
      .from('teams')
      .select(`
        id, name, color, logo_url, team_code, league_id,
        league:leagues!teams_league_id_fkey(id, name, slug, sport, payment_mode, price_cents, currency),
        team_members(
          id, role, status, user_id, position,
          profile:profiles!team_members_user_id_fkey(full_name, email, phone, avatar_url)
        )
      `)
      .eq('id', teamId)
      .eq('organization_id', org.id)
      .single(),
    db
      .from('team_members')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    db
      .from('org_members')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .single(),
    db
      .from('team_join_requests')
      .select(`
        id, message, created_at,
        profile:profiles!team_join_requests_user_id_fkey(full_name, email)
      `)
      .eq('team_id', teamId)
      .eq('organization_id', org.id)
      .eq('status', 'pending'),
    db.from('org_branding').select('timezone').eq('organization_id', org.id).single(),
  ])

  if (!team) notFound()

  const league = Array.isArray(team.league) ? team.league[0] : team.league
  const leagueId = (league as { id?: string } | null)?.id ?? ''
  const leagueSport = (league as { sport?: string } | null)?.sport ?? ''
  const paymentMode = (league as { payment_mode?: string } | null)?.payment_mode ?? 'per_player'
  const leaguePriceCents = (league as { price_cents?: number } | null)?.price_cents ?? 0
  const leagueCurrency = (league as { currency?: string } | null)?.currency ?? 'cad'
  const leagueSlug = (league as { slug?: string } | null)?.slug ?? ''
  const timezone = orgBranding?.timezone ?? 'America/Toronto'

  const isPerTeam = paymentMode === 'per_team' && leaguePriceCents > 0

  // Fetch team payment status + captain's own registration in parallel (per-team only)
  const [{ data: teamPayment }, { data: myLeagueRegistration }] = isPerTeam
    ? await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any)
          .from('payments')
          .select('id, status, paid_at, amount_cents')
          .eq('team_id', teamId)
          .eq('league_id', leagueId)
          .eq('payment_type', 'team')
          .maybeSingle(),
        db
          .from('registrations')
          .select('id, status')
          .eq('league_id', leagueId)
          .eq('user_id', user.id)
          .eq('organization_id', org.id)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }]

  const positions = await getPositionsForSport(org.id, leagueSport)

  const isOrgAdmin = ['org_admin', 'league_admin'].includes(orgMember?.role ?? '')
  // Must be a team member OR an org admin
  if (!myMembership && !isOrgAdmin) notFound()

  const allMembers = (team.team_members ?? []) as unknown as Array<{
    id: string
    role: string
    status: string
    user_id: string | null
    position: string | null
    profile: { full_name: string; email: string; phone: string | null; avatar_url: string | null } | { full_name: string; email: string; phone: string | null; avatar_url: string | null }[] | null
  }>
  const activeMembers = allMembers.filter((m) => m.status === 'active')
  const isManager = isOrgAdmin || ['captain', 'coach'].includes(myMembership?.role ?? '')
  const captain = activeMembers.find((m) => m.role === 'captain')
  const captainProfile = captain ? (Array.isArray(captain.profile) ? captain.profile[0] : captain.profile) : null

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">

        <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">← Dashboard</Link>

        {/* Payment success banner */}
        {paymentResult === 'success' && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-5 py-4 text-sm text-green-800 font-medium">
            🎉 Payment received! All team members&apos; registrations are now confirmed.
          </div>
        )}

        {/* Team header */}
        <div className="mt-4 flex items-center gap-4">
          {team.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo_url} alt={team.name} className="w-16 h-16 rounded-xl object-contain bg-white border shadow-sm" />
          ) : team.color ? (
            <div className="w-16 h-16 rounded-xl shrink-0 shadow-sm" style={{ backgroundColor: team.color }} />
          ) : null}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>{team.name}</h1>
            {league && (
              <Link
                href={`/events/${(league as { slug?: string }).slug ?? ''}`}
                className="text-sm text-gray-500 hover:underline mt-0.5 block"
              >
                {(league as { name?: string }).name}
              </Link>
            )}
          </div>
          {/* Edit team details — managers and org admins only */}
          {isManager && (
            <div className="shrink-0">
              <AdminEditTeamForm
                team={{ id: team.id, name: team.name, color: team.color, logo_url: team.logo_url ?? null }}
                leagueId={leagueId}
              />
            </div>
          )}
        </div>

        {/* Team code — managers and org admins only */}
        {isManager && team.team_code && (
          <div className="mt-6 bg-white rounded-lg border p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Team Code</p>
              <p className="text-xl font-bold tracking-widest mt-0.5">{team.team_code}</p>
            </div>
            <p className="text-xs text-gray-400">Share this code so players can join your team</p>
          </div>
        )}

        {/* Roster — editable for managers, read-only for players */}
        {isManager ? (
          <CaptainRosterManager
            teamId={team.id}
            positions={positions}
            initialMembers={activeMembers.map((m) => {
              const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
              return {
                id: m.id,
                role: m.role,
                position: m.position ?? null,
                userId: m.user_id,
                isMe: m.user_id === user.id,
                name: profile?.full_name ?? '',
                email: profile?.email ?? '',
                avatarUrl: profile?.avatar_url ?? null,
              }
            })}
          />
        ) : (
          <div className="mt-6 bg-white rounded-lg border overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold">
                Roster <span className="text-gray-400 font-normal text-sm ml-1">{activeMembers.length} player{activeMembers.length !== 1 ? 's' : ''}</span>
              </h2>
            </div>
            <ul className="divide-y">
              {activeMembers.map((m) => {
                const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
                const isMe = m.user_id === user.id
                return (
                  <li key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar avatarUrl={profile?.avatar_url ?? null} name={profile?.full_name ?? '?'} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {profile?.full_name ?? '—'}
                          {isMe && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                        </p>
                        {isMe && profile?.email && (
                          <a href={`mailto:${profile.email}`} className="text-xs text-gray-400 hover:text-blue-600 truncate block">
                            {profile.email}
                          </a>
                        )}
                      </div>
                    </div>
                    {m.role !== 'player' && (
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.role === 'captain' ? 'bg-blue-100 text-blue-700' :
                        m.role === 'coach' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {m.role}
                      </span>
                    )}
                  </li>
                )
              })}
              {activeMembers.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-gray-400">No active members yet.</li>
              )}
            </ul>
          </div>
        )}

        {/* Team payment — managers only, per-team leagues */}
        {isManager && isPerTeam && (
          <TeamPaymentPanel
            teamId={teamId}
            leagueId={leagueId}
            leagueSlug={leagueSlug}
            orgId={org.id}
            priceCents={leaguePriceCents}
            currency={leagueCurrency}
            memberCount={activeMembers.length}
            isPaid={teamPayment?.status === 'paid'}
            paidAt={teamPayment?.paid_at ?? null}
            timezone={timezone}
            captainRegistrationStatus={
              myLeagueRegistration
                ? (myLeagueRegistration.status as string)
                : 'none'
            }
          />
        )}

        {/* Pending join requests — managers only */}
        {isManager && (
          <PendingJoinRequests
            teamId={team.id}
            initialRequests={(joinRequests ?? []).map((req) => {
              const profile = Array.isArray(req.profile) ? req.profile[0] : req.profile
              return {
                id: req.id,
                playerName: (profile as { full_name?: string } | null)?.full_name ?? '',
                playerEmail: (profile as { email?: string } | null)?.email ?? '',
                message: req.message ?? null,
                createdAt: req.created_at,
              }
            })}
          />
        )}

        {/* Payment status notice for regular players on per-team leagues */}
        {!isManager && isPerTeam && (
          <div className={`mt-4 rounded-lg border p-4 text-sm ${teamPayment?.status === 'paid' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            {teamPayment?.status === 'paid'
              ? '✓ Your team payment has been completed. Your registration is confirmed.'
              : '⚠ Team payment is pending. Your captain needs to complete payment to confirm your registration.'}
          </div>
        )}

        {/* Captain contact — shown to regular players */}
        {!isManager && captainProfile && (
          <div className="mt-4 bg-white rounded-lg border p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Team Captain</p>
            <p className="font-medium">{captainProfile.full_name}</p>
            {captainProfile.email && (
              <a href={`mailto:${captainProfile.email}`} className="text-sm text-blue-600 hover:underline mt-0.5 block">
                {captainProfile.email}
              </a>
            )}
            {captainProfile.phone && (
              <a href={`tel:${captainProfile.phone}`} className="text-sm text-gray-500 hover:underline mt-0.5 block">
                {captainProfile.phone}
              </a>
            )}
          </div>
        )}

        {/* Message team — managers only */}
        {isManager && activeMembers.length > 1 && (
          <div className="mt-4 bg-white rounded-lg border p-5">
            <h2 className="font-semibold mb-3">Message Team</h2>
            <TeamMessageForm teamId={team.id} memberCount={activeMembers.length} />
          </div>
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
