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
  const currentYM = nowLocal.slice(0, 7)

  // Parse requested month, default to current
  const ym =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentYM
  const [year, month] = ym.split('-').map(Number)

  // Fetch all non-archived, non-draft leagues with their season dates.
  // We show every event (active, registration_open) regardless of whether
  // games or sessions have been created yet — the bands span start→end date.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawLeagues } = await (db as any)
    .from('leagues')
    .select('id, name, slug, status, event_type, season_start_date, season_end_date')
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .in('status', ['registration_open', 'active', 'completed'])
    .order('season_start_date', { ascending: true, nullsFirst: false })

  const leagues = (rawLeagues ?? []).map((l: {
    id: string; name: string; slug: string; status: string
    event_type: string | null; season_start_date: string | null; season_end_date: string | null
  }) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    status: l.status,
    eventType: l.event_type ?? 'league',
    startDate: l.season_start_date,  // YYYY-MM-DD or null
    endDate: l.season_end_date,      // YYYY-MM-DD or null
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
      />
    </div>
  )
}
