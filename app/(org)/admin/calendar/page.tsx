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
  searchParams: Promise<{ month?: string; day?: string }>
}) {
  const { month: monthParam, day: dayParam } = await searchParams
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
  const currentYM = nowLocal.slice(0, 7) // YYYY-MM

  // Parse requested month, default to current
  const ym =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentYM
  const [year, month] = ym.split('-').map(Number)

  // Fetch window: cover the full grid (prev/next month overflow) plus UTC offset padding
  const windowStart = new Date(Date.UTC(year, month - 1, -6))   // 7 days before month start
  const windowEnd   = new Date(Date.UTC(year, month,    13))    // 13 days into next month

  // Fetch games + sessions in parallel
  const [{ data: rawGames }, { data: rawSessions }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('games')
      .select(`
        id, scheduled_at, court, status,
        home_team:teams!games_home_team_id_fkey(name),
        away_team:teams!games_away_team_id_fkey(name),
        league:leagues!games_league_id_fkey(id, name, slug, event_type)
      `)
      .eq('organization_id', org.id)
      .neq('status', 'cancelled')
      .gte('scheduled_at', windowStart.toISOString())
      .lte('scheduled_at', windowEnd.toISOString())
      .order('scheduled_at', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('event_sessions')
      .select(`
        id, scheduled_at, duration_minutes, capacity, status, location_override,
        league:leagues!event_sessions_league_id_fkey(id, name, slug, event_type)
      `)
      .eq('organization_id', org.id)
      .neq('status', 'cancelled')
      .gte('scheduled_at', windowStart.toISOString())
      .lte('scheduled_at', windowEnd.toISOString())
      .order('scheduled_at', { ascending: true }),
  ])

  // Tag each event with its local calendar date (YYYY-MM-DD)
  const localDate = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games = (rawGames ?? []).map((g: any) => ({
    id: g.id as string,
    type: 'game' as const,
    scheduled_at: g.scheduled_at as string,
    localDate: localDate(g.scheduled_at),
    court: g.court as string | null,
    status: g.status as string,
    home_team: (Array.isArray(g.home_team) ? g.home_team[0] : g.home_team) as { name: string } | null,
    away_team: (Array.isArray(g.away_team) ? g.away_team[0] : g.away_team) as { name: string } | null,
    league: (Array.isArray(g.league) ? g.league[0] : g.league) as { id: string; name: string; slug: string },
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (rawSessions ?? []).map((s: any) => ({
    id: s.id as string,
    type: 'session' as const,
    scheduled_at: s.scheduled_at as string,
    localDate: localDate(s.scheduled_at),
    court: null as null,
    status: s.status as string,
    home_team: null as null,
    away_team: null as null,
    capacity: s.capacity as number | null,
    location_override: s.location_override as string | null,
    league: (Array.isArray(s.league) ? s.league[0] : s.league) as { id: string; name: string; slug: string },
  }))

  const events = [...games, ...sessions].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Calendar</h1>
      <AdminCalendar
        events={events}
        year={year}
        month={month}
        timezone={timezone}
        currentYM={currentYM}
        initialDay={dayParam ?? null}
      />
    </div>
  )
}
