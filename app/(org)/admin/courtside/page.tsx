import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getAdminScope } from '@/lib/admin-scope'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { loadCourtsideDay } from '@/lib/courtside-day'
import { COURT_COOKIE, readCourtCookie } from '@/lib/courtside-order'
import { CourtsideLists } from '@/components/courtside/courtside-lists'
import { CourtsideDoors, type CourtsideDoor } from '@/components/door/courtside-doors'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Courtside' }

/**
 * Courtside mode — game-night score entry built for a phone in a dim gym:
 * one day's games as big cards, unscored first, each opening the existing
 * score sheet (all sport scoring modes) full-width. Day arrows hop between
 * game nights.
 */
export default async function CourtsidePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const scope = await getAdminScope(org.id)
  const db = createServiceRoleClient()

  // Door Alert shortcuts (any day: the door kit doesn't follow the schedule).
  const doorsPromise = loadCourtsideDoors(org.id)
  doorsPromise.catch(() => {})

  const { data: branding } = await db
    .from('org_branding').select('timezone').eq('organization_id', org.id).maybeSingle()
  const tz = branding?.timezone ?? 'America/Toronto'

  const params = await searchParams
  const day = await loadCourtsideDay({
    orgId: org.id,
    tz,
    dateParam: params.date,
    leagueIds: scope.isOrgAdmin ? null : scope.assignedLeagueIds,
  })
  const { date, todayLocal, prevDate: prevDateStr, nextDate: nextDateStr, dayLabel } = day

  // Sessions that day (drop-ins / pickup) — for the check-in shortcuts.
  let sessionsQuery = db
    .from('event_sessions')
    .select('id, league_id, league:leagues!event_sessions_league_id_fkey(id, name)')
    .eq('organization_id', org.id)
    .neq('status', 'cancelled')
    .gte('scheduled_at', day.dayStart)
    .lt('scheduled_at', day.dayEnd)
  if (!scope.isOrgAdmin && scope.assignedLeagueIds !== null) {
    sessionsQuery = sessionsQuery.in('league_id', scope.assignedLeagueIds.length > 0 ? scope.assignedLeagueIds : ['00000000-0000-0000-0000-000000000000'])
  }
  const { data: daySessions } = await sessionsQuery

  // Check-in shortcuts: every event playing this day (games, playoff matches
  // or sessions), one tap to its check-in screen.
  const checkinEvents = new Map<string, string>()
  for (const g of day.games) if (g.league?.id) checkinEvents.set(g.league.id, g.league.name)
  for (const m of day.bracketMatches) if (m.bracket?.league_id && !checkinEvents.has(m.bracket.league_id)) checkinEvents.set(m.bracket.league_id, m.bracket.name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (daySessions ?? []) as any[]) {
    const l = Array.isArray(s.league) ? s.league[0] : s.league
    if (l?.id) checkinEvents.set(l.id, l.name)
  }

  const doors = await doorsPromise

  return (
    // The admin shell already pads 16px; no second gutter on phones.
    <div className="max-w-xl mx-auto sm:px-4 py-2 sm:py-6 pb-24">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">Courtside</h1>
        <Link href="/admin/dashboard" className="inline-flex items-center min-h-10 text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
      </div>
      <div className="flex items-center justify-between mb-5">
        <Link href={`/admin/courtside?date=${prevDateStr}`} aria-label="Previous day"
          className="press inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border bg-white text-gray-600 font-bold">‹</Link>
        <div className="text-center">
          <p className="text-sm font-semibold">{dayLabel}</p>
          {date !== todayLocal && (
            <Link href="/admin/courtside" className="inline-flex items-center min-h-10 text-sm font-medium underline text-brand-ink">Back to today</Link>
          )}
        </div>
        <Link href={`/admin/courtside?date=${nextDateStr}`} aria-label="Next day"
          className="press inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border bg-white text-gray-600 font-bold">›</Link>
      </div>

      {doors.length > 0 && <CourtsideDoors doors={doors} from={date === todayLocal ? '/admin/courtside' : `/admin/courtside?date=${date}`} />}

      {checkinEvents.size > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Check-in</p>
          <div className="flex flex-wrap gap-2">
            {[...checkinEvents.entries()].map(([id, name]) => (
              <Link key={id} href={`/admin/events/${id}/checkin`}
                className="press inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">
                ✓ <span className="truncate max-w-[14rem]">{name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <CourtsideLists day={day} tz={tz} canClear emptyHint="Use the arrows above to check another day." initialCourt={readCourtCookie((await cookies()).get(COURT_COOKIE)?.value, day.date)} />
    </div>
  )
}

async function loadCourtsideDoors(orgId: string): Promise<CourtsideDoor[]> {
  if (!(await canAccess(orgId, 'door_alert'))) return []
  const db = createServiceRoleClient()
  const [{ data: stations }, { data: displays }] = await Promise.all([
    db.from('door_stations').select('id, name, is_armed, location_label').eq('organization_id', orgId).order('created_at'),
    db.from('door_displays').select('id, station_id').eq('organization_id', orgId).is('revoked_at', null),
  ])
  return (stations ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    isArmed: s.is_armed,
    locationLabel: s.location_label,
    displayIds: (displays ?? []).filter((d) => d.station_id === s.id).map((d) => d.id),
  }))
}
