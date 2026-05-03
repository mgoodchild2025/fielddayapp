import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { EventsFilter } from '@/components/events/events-filter'
import type { EventItem } from '@/components/events/events-filter'

export default async function EventsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: leagues }, { data: branding }, { data: orgMember }] = await Promise.all([
    (supabase as any)
      .from('leagues')
      .select('id, name, slug, status, event_type, sport, price_cents, currency, season_start_date')
      .eq('organization_id', org.id)
      .neq('status', 'draft')
      .order('created_at', { ascending: false }),
    supabase.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    user
      ? supabase.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const isOrgAdmin = ['org_admin', 'league_admin'].includes(orgMember?.role ?? '')

  const events: EventItem[] = (leagues ?? []).map((l: EventItem) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    status: l.status,
    event_type: l.event_type,
    sport: l.sport,
    price_cents: l.price_cents ?? 0,
    currency: l.currency ?? 'cad',
    season_start_date: l.season_start_date ?? null,
  }))

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
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
