import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { ViewEventsDropdown } from '@/components/events/view-events-dropdown'
import { MarketingPage } from '@/components/marketing/marketing-page'

// Org homepage — shown when org context is present
async function OrgHomePage({ orgId }: { orgId: string }) {
  const supabase = await createServerClient()

  const [{ data: org }, { data: branding }, { data: leagues }] = await Promise.all([
    supabase.from('organizations').select('id, slug, name').eq('id', orgId).single(),
    supabase.from('org_branding').select('tagline, hero_image_url, logo_url').eq('organization_id', orgId).single(),
    supabase.from('leagues')
      .select('id, name, slug, event_type, status, season_start_date, price_cents, currency')
      .eq('organization_id', orgId)
      .neq('status', 'draft')
      .neq('status', 'archived')
      .order('season_start_date', { ascending: true })
      .limit(50),
  ])

  if (!org) return <MarketingPage />

  const orgContext = { id: org.id, slug: org.slug, name: org.name }

  const openEvents = (leagues ?? []).filter((l) => l.status === 'registration_open')
  const inSeasonEvents = (leagues ?? []).filter((l) => l.status === 'active')
  const completedEvents = (leagues ?? []).filter((l) => l.status === 'completed')

  const eventTypeLabels: Record<string, string> = {
    league: 'League', tournament: 'Tournament', pickup: 'Pickup', drop_in: 'Drop-in',
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <OrgNav org={orgContext} logoUrl={branding?.logo_url ?? null} />

      {/* Hero */}
      <section className="relative py-24 px-6 text-white" style={{ backgroundColor: 'var(--brand-secondary)' }}>
        {branding?.hero_image_url && (
          <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${branding.hero_image_url})` }} />
        )}
        <div className="relative max-w-4xl mx-auto text-center">
          {/* Large logo above org name — hero acts as the brand bar on the home page */}
          {branding?.logo_url && (
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full ring-4 ring-white/20 overflow-hidden">
                <Image
                  src={branding.logo_url}
                  alt={org.name}
                  width={112}
                  height={112}
                  className="w-full h-full object-contain"
                  unoptimized
                />
              </div>
            </div>
          )}
          <h1 className="text-5xl md:text-7xl font-bold uppercase tracking-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            {org.name}
          </h1>
          {branding?.tagline && (
            <p className="mt-4 text-xl md:text-2xl opacity-80">{branding.tagline}</p>
          )}
          <ViewEventsDropdown
            inSeason={inSeasonEvents.map(({ id, name, slug }) => ({ id, name, slug }))}
            completed={completedEvents.map(({ id, name, slug }) => ({ id, name, slug }))}
          />
        </div>
      </section>

      {/* Open for Registration */}
      {openEvents.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 py-12">
          <h2
            className="text-2xl sm:text-3xl font-bold mb-6 uppercase"
            style={{ fontFamily: 'var(--brand-heading-font)' }}
          >
            Open for Registration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {openEvents.map((league) => {
              const et = (league as { event_type?: string | null }).event_type ?? 'league'
              return (
                <Link
                  key={league.id}
                  href={`/events/${league.slug}`}
                  className="block bg-white rounded-lg shadow-sm border p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {eventTypeLabels[et] ?? et}
                    </span>
                    <span className="text-xs text-green-600 font-medium">Open</span>
                  </div>
                  <h3 className="text-lg font-bold mt-2" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                    {league.name}
                  </h3>
                  {league.season_start_date && (
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(league.season_start_date).toLocaleDateString('en-CA', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  )}
                  <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                    {league.price_cents === 0
                      ? 'Free'
                      : `$${(league.price_cents / 100).toFixed(0)} ${(league.currency ?? 'CAD').toUpperCase()}`}
                  </p>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {openEvents.length === 0 && (
        <section className="max-w-5xl mx-auto px-6 py-16 text-center">
          <p className="text-gray-400">No events currently open for registration.</p>
        </section>
      )}

      <Footer org={orgContext} />
    </div>
  )
}

export default async function RootPage() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) return <MarketingPage />
  return <OrgHomePage orgId={orgId} />
}
