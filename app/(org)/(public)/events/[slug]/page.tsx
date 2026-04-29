import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { RequestJoinButton } from '@/components/teams/request-join-button'
import { SessionJoinButton } from '@/components/sessions/session-join-button'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EventRulesModal } from '@/components/events/event-rules-modal'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const db = createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: league }, { data: branding }] = await Promise.all([
    (supabase as any).from('leagues').select('*').eq('organization_id', org.id).eq('slug', slug).neq('status', 'draft').single(),
    supabase.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
  ])

  if (!league) notFound()

  const isSessionBased = league.event_type === 'pickup' || league.event_type === 'drop_in'

  // ── Session-based event data ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions } = isSessionBased
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('event_sessions')
        .select(`
          id, scheduled_at, duration_minutes, capacity,
          location_override, notes, status,
          session_registrations(count)
        `)
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
    : { data: null }

  // Which sessions is the current user registered for?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mySessionRegs } = (isSessionBased && user)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('session_registrations')
        .select('session_id')
        .eq('league_id', league.id)
        .eq('user_id', user.id)
        .eq('status', 'registered')
    : { data: null }

  const mySessionIds = new Set((mySessionRegs ?? []).map((r: { session_id: string }) => r.session_id))

  // ── Team-based event data ──────────────────────────────────────────────
  const canJoinTeam = !isSessionBased && league.team_join_policy !== 'admin_only' && league.league_type === 'team'
  const { data: teams } = canJoinTeam
    ? await supabase
        .from('teams')
        .select(`id, name, color, team_members(id, status)`)
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .eq('status', 'active')
        .order('name')
    : { data: null }

  const { data: myMemberships } = (user && teams)
    ? await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .in('team_id', teams.map((t) => t.id))
    : { data: null }

  const { data: myRequests } = (user && teams)
    ? await supabase
        .from('team_join_requests')
        .select('team_id, status')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .in('team_id', teams.map((t) => t.id))
    : { data: null }

  const myTeamIds = new Set(myMemberships?.map((m) => m.team_id) ?? [])
  const myRequestTeamIds = new Set(myRequests?.map((r) => r.team_id) ?? [])

  const { data: myRegistration } = (user && !isSessionBased)
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
          <Link href="/events" className="text-sm text-gray-500 hover:underline">← All Events</Link>
        </div>
        <h1 className="text-4xl font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {league.name}
        </h1>
        <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
          <span className="capitalize">{league.sport?.replace('_', ' ')}</span>
          <span>·</span>
          <span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>{price}</span>
        </div>

        {league.description && (
          <p className="mt-6 text-gray-700 leading-relaxed">{league.description}</p>
        )}

        {/* Info cards */}
        <div className="mt-8 grid grid-cols-2 gap-4">
          {league.age_group && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Age Group</p>
              <p className="font-semibold mt-1">{league.age_group}</p>
            </div>
          )}
          {league.season_start_date && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {league.event_type === 'league' ? 'Season Start' : 'Event Date'}
              </p>
              <p className="font-semibold mt-1">{new Date(league.season_start_date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          )}
          {league.registration_closes_at && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Registration Closes</p>
              <p className="font-semibold mt-1">{new Date(league.registration_closes_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          )}
          {!isSessionBased && league.max_teams && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Max Teams</p>
              <p className="font-semibold mt-1">{league.max_teams}</p>
            </div>
          )}
          {!isSessionBased && league.min_team_size && league.max_team_size && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Team Size</p>
              <p className="font-semibold mt-1">{league.min_team_size}–{league.max_team_size} players</p>
            </div>
          )}
          {isSessionBased && league.max_participants && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Max Per Session</p>
              <p className="font-semibold mt-1">{league.max_participants}</p>
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

        {/* Event Rules */}
        {league.rules_content && (
          <div className="mt-6 bg-white rounded-lg border p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Event Rules</p>
            <p className="text-sm text-gray-500">Rules and regulations for this event.</p>
            <EventRulesModal content={league.rules_content} />
          </div>
        )}

        {/* ── Sessions (pickup / drop-in) ── */}
        {isSessionBased && (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                Upcoming Sessions
              </h2>
              {league.pickup_join_policy === 'private' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  Invite only
                </span>
              )}
            </div>
            {(!sessions || sessions.length === 0) ? (
              <p className="text-gray-400 text-sm py-8 text-center bg-white border rounded-lg">
                No sessions scheduled yet — check back soon.
              </p>
            ) : (
              <div className="space-y-3">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(sessions as any[]).map((s) => {
                  const registeredCount = s.session_registrations?.[0]?.count ?? 0
                  const isFull = s.capacity !== null && registeredCount >= s.capacity
                  const isJoined = mySessionIds.has(s.id)
                  const isCancelled = s.status === 'cancelled'
                  const remaining = s.capacity !== null ? s.capacity - registeredCount : null

                  return (
                    <div
                      key={s.id}
                      className={`bg-white border rounded-lg p-4 flex items-center justify-between gap-4 ${isCancelled ? 'opacity-50' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{formatDateTime(s.scheduled_at)}</p>
                          {isCancelled && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>
                          )}
                          {isJoined && !isCancelled && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Joined ✓</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span>{s.duration_minutes} min</span>
                          {s.location_override && <><span>·</span><span>{s.location_override}</span></>}
                          {!isCancelled && (
                            remaining === null
                              ? <span>{registeredCount} registered</span>
                              : isFull
                                ? <span className="text-red-600 font-medium">Full ({s.capacity} spots)</span>
                                : <span className="text-green-700 font-medium">{remaining} of {s.capacity} spots left</span>
                          )}
                        </div>
                        {s.notes && <p className="text-xs text-gray-400 mt-1">{s.notes}</p>}
                      </div>
                      <div className="shrink-0">
                        {league.pickup_join_policy === 'private' ? (
                          isJoined && !isCancelled ? (
                            <span className="text-xs px-3 py-1.5 rounded-md bg-green-50 text-green-700 font-medium">Joined ✓</span>
                          ) : null
                        ) : (
                          <SessionJoinButton
                            sessionId={s.id}
                            leagueId={league.id}
                            isJoined={isJoined}
                            isFull={isFull}
                            isCancelled={isCancelled}
                            isLoggedIn={!!user}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Teams (team-based events) ── */}
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

        {/* ── Registration CTA (non-session events only) ── */}
        {!isSessionBased && (
          myRegistration ? (
            <div className="mt-8 w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide bg-green-50 border border-green-200 text-green-700" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              ✓ You&apos;re registered
              {myRegistration.status === 'pending' && (
                <span className="block text-sm font-normal normal-case text-green-600 mt-1">Your registration is pending approval</span>
              )}
            </div>
          ) : isOpen ? (
            <Link
              href={`/register/${league.slug}`}
              className="mt-8 inline-block w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-primary)', fontFamily: 'var(--brand-heading-font)' }}
            >
              Register Now
            </Link>
          ) : null
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
