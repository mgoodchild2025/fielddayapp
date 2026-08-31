import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { EventsFilter } from '@/components/events/events-filter'
import type { EventItem } from '@/components/events/events-filter'
import { getEventSpotsMap } from '@/lib/event-spots'

export default async function EventsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()



  const [{ data: leagues }, { data: branding }] = await Promise.all([

    // select('*') so this still works before migration 168 (new columns absent).
    db
      .from('leagues')
      .select('*')
      .eq('organization_id', org.id)
      .is('deleted_at', null)
      .not('status', 'in', '(draft,archived)')
      .order('created_at', { ascending: false }),

    db.from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
  ])


  // Advertised "coming soon" drafts — separate query so it degrades to empty if
  // migration 168 (advertised column) hasn't been applied yet.

  const { data: comingSoonRaw } = await db
    .from('leagues')
    .select('*')
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .eq('status', 'draft')
    .eq('advertised', true)
    .order('registration_opens_at', { ascending: true })

  const nowMs = Date.now()
  // Only keep advertised drafts whose registration hasn't opened/passed yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comingSoon = ((comingSoonRaw ?? []) as any[]).filter((l) =>
    !l.registration_opens_at || new Date(l.registration_opens_at).getTime() > nowMs
  )
  const visibleLeagues = [...((leagues ?? []) as any[]), ...comingSoon]

  // Live capacity for open events — same computation the home page cards use.
  const openLeagues = visibleLeagues.filter((l: { status: string }) => l.status === 'registration_open')
  const spotsMap = await getEventSpotsMap(db, openLeagues.map((l) => ({
    id: l.id,
    payment_mode: l.payment_mode ?? null,
    event_type: l.event_type ?? null,
    max_teams: l.max_teams ?? null,
    max_participants: l.max_participants ?? null,
  })))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: EventItem[] = visibleLeagues.map((l: any) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    status: l.status,
    event_type: l.event_type,
    sport: l.sport,
    logo_url: l.logo_url ?? null,
    price_cents: l.price_cents ?? 0,
    drop_in_price_cents: l.drop_in_price_cents ?? null,
    currency: l.currency ?? 'cad',
    season_start_date: l.season_start_date ?? null,
    max_teams: l.max_teams ?? null,
    spots: spotsMap.get(l.id) ?? null,
    payment_mode: l.payment_mode ?? 'per_player',
    skill_level: l.skill_level ?? null,
    days_of_week: l.days_of_week ?? null,
    game_start_time: l.game_start_time ?? null,
    game_end_time: l.game_end_time ?? null,
    advertised: l.advertised ?? false,
    featured: l.featured ?? false,
    registration_opens_at: l.registration_opens_at ?? null,
    teaser_text: l.teaser_text ?? null,
  }))

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex-1">
        <h1
          className="text-2xl sm:text-3xl font-bold uppercase mb-6"
          style={{ fontFamily: 'var(--brand-heading-font)' }}
        >
          Events
        </h1>
        <EventsFilter events={events} timezone={branding?.timezone ?? undefined} />
      </div>
      <Footer org={org} />
    </div>
  )
}
