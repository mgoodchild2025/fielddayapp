import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { EventsFilter } from '@/components/events/events-filter'
import type { EventItem } from '@/components/events/events-filter'

export default async function EventsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: leagues }, { data: branding }, { data: orgMember }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('leagues')
      .select('id, name, slug, status, event_type, sport, logo_url, price_cents, currency, season_start_date, max_teams, payment_mode, skill_level, days_of_week, game_start_time, game_end_time')
      .eq('organization_id', org.id)
      .is('deleted_at', null)
      .not('status', 'in', '(draft,archived)')
      .order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (db as any).from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const isOrgAdmin = ['org_admin', 'league_admin'].includes(orgMember?.role ?? '')

  // Fetch team counts for open-registration leagues so we can show capacity
  const openIds = (leagues ?? [])
    .filter((l: { status: string }) => l.status === 'registration_open')
    .map((l: { id: string }) => l.id)

  const teamCountMap = new Map<string, number>()
  if (openIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: teamRows } = await (db as any)
      .from('teams')
      .select('league_id')
      .in('league_id', openIds)
    for (const t of teamRows ?? []) {
      teamCountMap.set(t.league_id, (teamCountMap.get(t.league_id) ?? 0) + 1)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: EventItem[] = (leagues ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    status: l.status,
    event_type: l.event_type,
    sport: l.sport,
    logo_url: l.logo_url ?? null,
    price_cents: l.price_cents ?? 0,
    currency: l.currency ?? 'cad',
    season_start_date: l.season_start_date ?? null,
    max_teams: l.max_teams ?? null,
    team_count: teamCountMap.get(l.id) ?? 0,
    payment_mode: l.payment_mode ?? 'per_player',
    skill_level: l.skill_level ?? null,
    days_of_week: l.days_of_week ?? null,
    game_start_time: l.game_start_time ?? null,
    game_end_time: l.game_end_time ?? null,
  }))

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex-1">
        <h1
          className="text-2xl sm:text-3xl font-bold uppercase mb-6"
          style={{ fontFamily: 'var(--brand-heading-font)' }}
        >
          Events
        </h1>
        <EventsFilter events={events} isOrgAdmin={isOrgAdmin} />
      </div>
      <Footer org={org} />
    </div>
  )
}
