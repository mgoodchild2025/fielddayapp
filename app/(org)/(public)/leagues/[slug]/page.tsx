import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { RequestJoinButton } from '@/components/teams/request-join-button'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { LeagueRulesModal } from '@/components/leagues/league-rules-modal'

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireAuth()

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: league }, { data: branding }] = await Promise.all([
    supabase.from('leagues').select('*').eq('organization_id', org.id).eq('slug', slug).neq('status', 'draft').single(),
    supabase.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
  ])

  if (!league) notFound()

  // Load teams if joining is open or captain_invite
  const canJoinTeam = league.team_join_policy !== 'admin_only' && league.league_type === 'team'
  const { data: teams } = canJoinTeam
    ? await supabase
        .from('teams')
        .select(`
          id, name, color,
          team_members(id, status)
        `)
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .eq('status', 'active')
        .order('name')
    : { data: null }

  // Check if current user already has a join request or is a member of any team
  const { data: myMemberships } = user
    ? await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .in('team_id', teams?.map((t) => t.id) ?? [])
    : { data: null }

  const { data: myRequests } = user
    ? await supabase
        .from('team_join_requests')
        .select('team_id, status')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .in('team_id', teams?.map((t) => t.id) ?? [])
    : { data: null }

  const myTeamIds = new Set(myMemberships?.map((m) => m.team_id) ?? [])
  const myRequestTeamIds = new Set(myRequests?.map((r) => r.team_id) ?? [])

  // Check if the current user is already registered for this league
  const { data: myRegistration } = user
    ? await supabase
        .from('registrations')
        .select('id, status')
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .single()
    : { data: null }

  const isOpen = league.status === 'registration_open'
  const price = league.price_cents === 0
    ? 'Free'
    : `$${(league.price_cents / 100).toFixed(0)} ${league.currency.toUpperCase()}`

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-2">
          <Link href="/leagues" className="text-sm text-gray-500 hover:underline">← All Leagues</Link>
        </div>
        <h1 className="text-4xl font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {league.name}
        </h1>
        <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
          <span className="capitalize">{league.league_type}</span>
          <span>·</span>
          <span className="capitalize">{league.sport?.replace('_', ' ')}</span>
          <span>·</span>
          <span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>{price}</span>
        </div>

        {league.description && (
          <p className="mt-6 text-gray-700 leading-relaxed">{league.description}</p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4">
          {league.age_group && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Age Group</p>
              <p className="font-semibold mt-1">{league.age_group}</p>
            </div>
          )}
          {league.season_start_date && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Season Start</p>
              <p className="font-semibold mt-1">{new Date(league.season_start_date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          )}
          {league.registration_closes_at && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Registration Closes</p>
              <p className="font-semibold mt-1">{new Date(league.registration_closes_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          )}
          {league.max_teams && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Max Teams</p>
              <p className="font-semibold mt-1">{league.max_teams}</p>
            </div>
          )}
          {league.min_team_size && league.max_team_size && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Team Size</p>
              <p className="font-semibold mt-1">{league.min_team_size}–{league.max_team_size} players</p>
            </div>
          )}
        </div>

        {/* Venue */}
        {(league.venue_name || league.venue_address) && (
          <div className="mt-6 bg-white rounded-lg border p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Location</p>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {league.venue_name && <p className="font-semibold">{league.venue_name}</p>}
                {league.venue_address && (
                  <p className="text-sm text-gray-600 mt-0.5">{league.venue_address}</p>
                )}
                {(league.venue_type || league.venue_surface) && (
                  <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-500">
                    {league.venue_type && <span className="capitalize">{league.venue_type}</span>}
                    {league.venue_type && league.venue_surface && <span>·</span>}
                    {league.venue_surface && <span>{league.venue_surface}</span>}
                  </div>
                )}
              </div>
              {league.venue_address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(league.venue_address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on Google Maps"
                  className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full border hover:bg-gray-50 transition-colors"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Organizer */}
        {(league.organizer_name || league.organizer_email) && (
          <div className="mt-4 bg-white rounded-lg border p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Organizer</p>
            {league.organizer_name && <p className="font-semibold">{league.organizer_name}</p>}
            {league.organizer_email && (
              <a href={`mailto:${league.organizer_email}`} className="text-sm text-blue-600 hover:underline mt-1 block">
                {league.organizer_email}
              </a>
            )}
            {league.organizer_phone && <p className="text-sm text-gray-600 mt-1">{league.organizer_phone}</p>}
          </div>
        )}

        {/* League Rules */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(league as any).rules_content && (
          <div className="mt-6 bg-white rounded-lg border p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">League Rules</p>
            <p className="text-sm text-gray-500">Rules and regulations for this league.</p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <LeagueRulesModal content={(league as any).rules_content} />
          </div>
        )}

        {/* Teams list with join requests */}
        {canJoinTeam && teams && teams.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4" style={{ fontFamily: 'var(--brand-heading-font)' }}>Teams</h2>
            <div className="space-y-2">
              {teams.map((team) => {
                const memberCount = (team.team_members ?? []).filter(
                  (m: { status: string }) => m.status === 'active'
                ).length
                const isMember = myTeamIds.has(team.id)
                const hasRequest = myRequestTeamIds.has(team.id)

                return (
                  <div key={team.id} className="bg-white rounded-lg border p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {team.color && (
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                      )}
                      <div>
                        <p className="font-semibold">{team.name}</p>
                        <p className="text-xs text-gray-500">{memberCount} player{memberCount !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div>
                      {isMember ? (
                        <span className="text-xs text-green-600 font-medium">You&apos;re on this team</span>
                      ) : hasRequest ? (
                        <span className="text-xs text-amber-600 font-medium">Request pending…</span>
                      ) : (league.team_join_policy !== 'admin_only' && myRegistration) ? (
                        <RequestJoinButton teamId={team.id} teamName={team.name} />
                      ) : !myRegistration ? (
                        <span className="text-xs text-gray-400">Register to join</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {myRegistration ? (
          <div className="mt-8 w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide bg-green-50 border border-green-200 text-green-700" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            ✓ You&apos;re registered
            {myRegistration.status === 'pending' && (
              <span className="block text-sm font-normal normal-case text-green-600 mt-1">Your registration is pending approval</span>
            )}
          </div>
        ) : isOpen && (
          <Link
            href={`/register/${league.slug}`}
            className="mt-8 inline-block w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--brand-primary)', fontFamily: 'var(--brand-heading-font)' }}
          >
            Register Now
          </Link>
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
