import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { AdminCalendar } from '@/components/admin/admin-calendar'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Calendar' }

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string; drafts?: string }>
}) {
  const { month: monthParam, day: dayParam, drafts: draftsParam } = await searchParams
  const showDrafts = draftsParam === '1'

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org)

  const db = createServiceRoleClient()

  // Org timezone
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: branding } = await (db as any)
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .maybeSingle()
  const timezone: string = branding?.timezone ?? 'America/Toronto'

  // Resolve current month in org timezone
  const nowLocal = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const currentYM = nowLocal.slice(0, 7)

  // Parse requested month, default to current
  const ym =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentYM
  const [year, month] = ym.split('-').map(Number)

  // Statuses to include: always show active events; include draft when toggled
  const statuses = ['registration_open', 'active', 'completed', ...(showDrafts ? ['draft'] : [])]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawLeagues } = await (db as any)
    .from('leagues')
    .select('id, name, slug, status, event_type, season_start_date, season_end_date, game_start_time, game_end_time, days_of_week')
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .in('status', statuses)
    .order('season_start_date', { ascending: true, nullsFirst: false })

  // Drop-in / pickup events may have no season span — they're defined by their
  // individual sessions. For those, surface each session's date on the calendar.
  // Any event without a full season span is placed by its sessions (only
  // pickup / drop-in events actually have sessions, so others simply match none).
  const undatedSessionLeagueIds: string[] = (rawLeagues ?? [])
    .filter((l: { season_start_date: string | null; season_end_date: string | null }) =>
      !l.season_start_date || !l.season_end_date)
    .map((l: { id: string }) => l.id)

  const sessionDatesByLeague = new Map<string, string[]>()
  if (undatedSessionLeagueIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawSessions } = await (db as any)
      .from('event_sessions')
      .select('league_id, scheduled_at')
      .eq('organization_id', org.id)
      .in('league_id', undatedSessionLeagueIds)
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })  // → YYYY-MM-DD
    for (const s of (rawSessions ?? []) as { league_id: string; scheduled_at: string }[]) {
      if (!s.scheduled_at) continue
      const dateStr = fmt.format(new Date(s.scheduled_at))
      const arr = sessionDatesByLeague.get(s.league_id) ?? []
      if (!arr.includes(dateStr)) arr.push(dateStr)
      sessionDatesByLeague.set(s.league_id, arr)
    }
  }

  const leagues = (rawLeagues ?? []).map((l: {
    id: string; name: string; slug: string; status: string
    event_type: string | null; season_start_date: string | null; season_end_date: string | null
    game_start_time: string | null; game_end_time: string | null
    days_of_week: string[] | null
  }) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    status: l.status,
    eventType: l.event_type ?? 'league',
    startDate: l.season_start_date,
    endDate: l.season_end_date,
    gameStartTime: l.game_start_time,
    gameEndTime: l.game_end_time,
    daysOfWeek: l.days_of_week,
    sessionDates: sessionDatesByLeague.get(l.id) ?? null,
  }))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Calendar</h1>
      <AdminCalendar
        leagues={leagues}
        year={year}
        month={month}
        timezone={timezone}
        currentYM={currentYM}
        initialDay={dayParam ?? null}
        showDrafts={showDrafts}
      />
    </div>
  )
}
