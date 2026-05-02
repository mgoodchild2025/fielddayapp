import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { QRScanner } from '@/components/checkin/qr-scanner'
import { CheckInList } from '@/components/checkin/checkin-list'

const SESSION_EVENT_TYPES = ['drop_in', 'pickup']

// Format a UTC timestamp as a human-readable session label in the org timezone
function formatSessionLabel(scheduledAt: string, timezone: string): string {
  return new Date(scheduledAt).toLocaleString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

// Pick the best default session: today's session if one exists, otherwise the
// soonest upcoming session, otherwise the most recent past session.
function pickDefaultSession(
  sessions: { id: string; scheduled_at: string }[],
  timezone: string,
): string | null {
  if (!sessions.length) return null

  const now = new Date()
  // Get today's date string in org timezone (YYYY-MM-DD)
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone })

  // Prefer a session that starts today
  const todaySession = sessions.find((s) => {
    const sessionDate = new Date(s.scheduled_at).toLocaleDateString('en-CA', { timeZone: timezone })
    return sessionDate === todayStr
  })
  if (todaySession) return todaySession.id

  // Next: first upcoming session
  const upcoming = sessions.find((s) => new Date(s.scheduled_at) > now)
  if (upcoming) return upcoming.id

  // Fallback: most recent past session (last in list since ordered ascending)
  return sessions[sessions.length - 1].id
}

export default async function AdminCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ session?: string }>
}) {
  const { id } = await params
  const { session: sessionParam } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [leagueRes, brandingRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, name, event_type').eq('id', id).eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('timezone, checkin_sound').eq('organization_id', org.id).single(),
  ])

  const league = leagueRes.data
  const timezone = brandingRes.data?.timezone ?? 'America/Toronto'
  const checkinSound = brandingRes.data?.checkin_sound ?? null

  if (!league) notFound()

  const isSessionEvent = SESSION_EVENT_TYPES.includes(league.event_type)

  // ── Session-based check-in (drop_in / pickup) ──────────────────────────────
  if (isSessionEvent) {
    // Fetch all sessions for this event, ordered by scheduled_at
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessions } = await (db as any)
      .from('event_sessions')
      .select('id, scheduled_at, capacity, status')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('scheduled_at', { ascending: true })

    const sessionList: { id: string; scheduled_at: string; capacity: number | null; status: string }[] = sessions ?? []

    const selectedSessionId = sessionParam ?? pickDefaultSession(sessionList, timezone)
    const selectedSession = sessionList.find((s) => s.id === selectedSessionId) ?? null

    // Fetch session_registrations for the selected session
    let rows: {
      id: string
      playerName: string
      teamName: string | null
      checkinToken: string
      checkedInAt: string | null
      isWalkIn: boolean
      sessionRegistrationId: string
    }[] = []

    if (selectedSession) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sessionRegs } = await (db as any)
        .from('session_registrations')
        .select(`
          id, user_id, checked_in_at, is_walk_in, status,
          profile:profiles!session_registrations_user_id_fkey(full_name)
        `)
        .eq('session_id', selectedSession.id)
        .eq('organization_id', org.id)
        .eq('status', 'registered')

      // Fetch event-level registrations for checkin_tokens
      const userIds = (sessionRegs ?? []).map((r: { user_id: string }) => r.user_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: eventRegs } = userIds.length > 0 ? await (db as any)
        .from('registrations')
        .select('id, user_id, checkin_token')
        .eq('league_id', id)
        .eq('organization_id', org.id)
        .in('user_id', userIds) : { data: [] }

      const eventRegByUserId = new Map<string, { id: string; checkin_token: string }>()
      for (const er of (eventRegs ?? [])) {
        eventRegByUserId.set(er.user_id, { id: er.id, checkin_token: er.checkin_token })
      }

      rows = (sessionRegs ?? []).map((sr: {
        id: string
        user_id: string
        checked_in_at: string | null
        is_walk_in: boolean
        profile: { full_name: string } | { full_name: string }[] | null
      }) => {
        const profile = Array.isArray(sr.profile) ? sr.profile[0] : sr.profile
        const eventReg = eventRegByUserId.get(sr.user_id)
        return {
          id: eventReg?.id ?? sr.user_id,  // event registration id for undo fallback
          playerName: profile?.full_name ?? 'Unknown',
          teamName: null,
          checkinToken: eventReg?.checkin_token ?? '',
          checkedInAt: sr.checked_in_at,
          isWalkIn: sr.is_walk_in ?? false,
          sessionRegistrationId: sr.id,
        }
      })

      // Sort: not-checked-in first, then checked-in; alpha within each group
      rows.sort((a, b) => {
        if (!a.checkedInAt && b.checkedInAt) return -1
        if (a.checkedInAt && !b.checkedInAt) return 1
        return a.playerName.localeCompare(b.playerName)
      })
    }

    return (
      <div className="space-y-8">
        {/* Session selector */}
        {sessionList.length > 0 ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Session</label>
            <div className="flex flex-wrap gap-2">
              {sessionList.map((s) => {
                const isSelected = s.id === selectedSessionId
                return (
                  <Link
                    key={s.id}
                    href={`/admin/events/${id}/checkin?session=${s.id}`}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      isSelected
                        ? 'text-white border-transparent'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    } ${s.status === 'cancelled' ? 'line-through opacity-50' : ''}`}
                    style={isSelected ? { backgroundColor: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' } : {}}
                  >
                    {formatSessionLabel(s.scheduled_at, timezone)}
                  </Link>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            No sessions have been created for this event yet. Create sessions from the Sessions tab.
          </div>
        )}

        {selectedSession && (
          <>
            {/* Scanner section */}
            <div>
              <h2 className="text-base font-semibold mb-4">Scan Player QR Code</h2>
              <div className="max-w-sm">
                <QRScanner
                  leagueId={id}
                  timezone={timezone}
                  checkinSound={checkinSound}
                  sessionId={selectedSession.id}
                />
              </div>
            </div>

            {/* Roster list */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">
                  Roster — {formatSessionLabel(selectedSession.scheduled_at, timezone)}
                </h2>
                {selectedSession.capacity && (
                  <span className="text-sm text-gray-500">
                    Capacity: {rows.length} / {selectedSession.capacity}
                  </span>
                )}
              </div>
              <CheckInList
                registrations={rows}
                leagueId={id}
                timezone={timezone}
                sessionId={selectedSession.id}
              />
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Event-level check-in (league / tournament) ─────────────────────────────
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

  const eventRows = (registrations ?? []).map((reg: {
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
  eventRows.sort((a: { checkedInAt: string | null; playerName: string }, b: { checkedInAt: string | null; playerName: string }) => {
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
          <QRScanner leagueId={id} timezone={timezone} checkinSound={checkinSound} />
        </div>
      </div>

      {/* Roster list */}
      <div>
        <h2 className="text-base font-semibold mb-4">Player Roster</h2>
        <CheckInList registrations={eventRows} leagueId={id} timezone={timezone} />
      </div>
    </div>
  )
}
