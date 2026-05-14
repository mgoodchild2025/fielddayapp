import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { QRCodeDisplay } from '@/components/checkin/qr-code-display'
import { PastGamesToggle } from '@/components/schedule/past-games-toggle'
import { EventAvatar } from '@/components/ui/event-avatar'

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  registration_open: { label: 'Open',       className: 'bg-green-50 text-green-700'   },
  active:            { label: 'In Season',  className: 'bg-blue-50 text-blue-700'     },
  completed:         { label: 'Completed',  className: 'bg-gray-100 text-gray-500'    },
  archived:          { label: 'Archived',   className: 'bg-gray-100 text-gray-400'    },
  draft:             { label: 'Draft',      className: 'bg-yellow-50 text-yellow-700' },
}

export default async function MyEventsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const host = headersList.get('host') ?? ''
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'

  const [{ data: branding }, { data: registrations }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('registrations').select(`
      id, status, checkin_token, created_at, session_id, registration_type,
      league:leagues!registrations_league_id_fkey(
        id, name, slug, league_status:status, event_type, sport, logo_url, season_start_date, season_end_date, checkin_enabled
      )
    `)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),
  ])

  // Fetch session dates for any drop-in registrations that have a session_id
  const sessionIds = (registrations ?? [])
    .map((r: { session_id: string | null }) => r.session_id)
    .filter(Boolean) as string[]

  const sessionDateMap = new Map<string, string>()
  if (sessionIds.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sessionRows } = await (db as any)
        .from('event_sessions')
        .select('id, scheduled_at')
        .in('id', sessionIds)
      for (const s of (sessionRows ?? [])) {
        sessionDateMap.set(s.id, s.scheduled_at)
      }
    } catch { /* session_id column not yet applied */ }
  }

  // Fetch branding timezone for session date formatting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: brandingTz } = await (db as any)
    .from('org_branding').select('timezone').eq('organization_id', org.id).single()
  const timezone = brandingTz?.timezone ?? 'America/Toronto'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = (registrations ?? []).map((r: any) => {
    const league = Array.isArray(r.league) ? r.league[0] : r.league
    const checkinUrl = r.checkin_token
      ? `${protocol}://${host}/checkin/${r.checkin_token}`
      : null
    const sessionScheduledAt = r.session_id ? sessionDateMap.get(r.session_id) ?? null : null
    return { registrationId: r.id, registrationStatus: r.status, checkinUrl, league, sessionScheduledAt, registrationType: r.registration_type }
  }).filter((r: { league: unknown }) => r.league)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentEvents = events.filter((e: any) =>
    ['active', 'registration_open'].includes(e.league?.league_status ?? '')
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pastEvents = events.filter((e: any) =>
    !['active', 'registration_open'].includes(e.league?.league_status ?? '')
  )

  function formatDate(iso: string | null) {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatSport(s: string) {
    return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        <h1
          className="text-2xl font-bold uppercase mb-6"
          style={{ fontFamily: 'var(--brand-heading-font)' }}
        >
          My Events
        </h1>

        {events.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center">
            <p className="text-gray-400 text-sm mb-3">You haven&apos;t registered for any events yet.</p>
            <Link
              href="/events"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Browse Events
            </Link>
          </div>
        ) : (
          <div>
            {/* Current events */}
            <div className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {currentEvents.map(({ registrationId, registrationStatus, checkinUrl, league, sessionScheduledAt, registrationType }: any) => {
                const statusInfo = STATUS_LABEL[league.league_status] ?? { label: league.league_status, className: 'bg-gray-100 text-gray-500' }
                const isActive = registrationStatus === 'active'
                const showQR = isActive && !!checkinUrl && ['active', 'registration_open'].includes(league.league_status) && league.checkin_enabled === true
                const isDropIn = registrationType === 'drop_in'
                const sessionLabel = sessionScheduledAt
                  ? new Date(sessionScheduledAt).toLocaleString('en-CA', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit', timeZone: timezone,
                    })
                  : null

                return (
                  <div
                    key={registrationId}
                    className="bg-white rounded-xl border overflow-hidden"
                  >
                    <Link
                      href={`/events/${league.slug}`}
                      className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors group"
                    >
                      <EventAvatar logoUrl={league.logo_url ?? null} name={league.name} sport={league.sport ?? null} size="sm" className="shrink-0 border border-gray-100" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 truncate">{league.name}</p>
                          {isDropIn && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-purple-50 text-purple-700">
                              Drop-in
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${statusInfo.className}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {league.sport ? formatSport(league.sport) : ''}
                          {sessionLabel
                            ? <>{league.sport ? ' · ' : ''}<span className="font-medium text-gray-500">{sessionLabel}</span></>
                            : <>{league.sport && league.season_start_date ? ' · ' : ''}{formatDate(league.season_start_date) ?? ''}</>
                          }
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                    {showQR && (
                      <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                        <QRCodeDisplay
                          checkinUrl={checkinUrl}
                          playerName=""
                          eventName={league.name}
                          size={180}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Past events — collapsed by default */}
            {pastEvents.length > 0 && (
              <PastGamesToggle count={pastEvents.length} label="events">
                <div className="space-y-3">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {pastEvents.map(({ registrationId, registrationStatus, checkinUrl, league }: any) => {
                    const statusInfo = STATUS_LABEL[league.league_status] ?? { label: league.league_status, className: 'bg-gray-100 text-gray-500' }

                    return (
                      <div
                        key={registrationId}
                        className="bg-white rounded-xl border overflow-hidden"
                      >
                        <Link
                          href={`/events/${league.slug}`}
                          className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors group"
                        >
                          <EventAvatar logoUrl={league.logo_url ?? null} name={league.name} sport={league.sport ?? null} size="sm" className="shrink-0 border border-gray-100 opacity-60" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900 truncate">{league.name}</p>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {league.sport ? formatSport(league.sport) : ''}
                              {league.sport && league.season_start_date ? ' · ' : ''}
                              {formatDate(league.season_start_date) ?? ''}
                            </p>
                          </div>
                          <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    )
                  })}
                </div>
              </PastGamesToggle>
            )}
          </div>
        )}
      </div>

      <Footer org={org} />
    </div>
  )
}
