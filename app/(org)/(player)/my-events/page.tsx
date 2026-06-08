import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { MyEventsClient } from './_client'
import type { EventItem } from './_client'

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
  const events: EventItem[] = (registrations ?? []).map((r: any) => {
    const league = Array.isArray(r.league) ? r.league[0] : r.league
    const checkinUrl = r.checkin_token
      ? `${protocol}://${host}/checkin/${r.checkin_token}`
      : null
    const sessionScheduledAt = r.session_id ? sessionDateMap.get(r.session_id) ?? null : null
    return { registrationId: r.id, registrationStatus: r.status, checkinUrl, league, sessionScheduledAt, registrationType: r.registration_type }
  }).filter((r: EventItem) => r.league)

  const currentEvents = events.filter(e =>
    ['active', 'registration_open'].includes(e.league?.league_status ?? '')
  )
  const pastEvents = events.filter(e =>
    !['active', 'registration_open'].includes(e.league?.league_status ?? '')
  )

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

        <MyEventsClient
          currentEvents={currentEvents}
          pastEvents={pastEvents}
          timezone={timezone}
        />
      </div>

      <Footer org={org} />
    </div>
  )
}
