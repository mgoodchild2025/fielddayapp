import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import Link from 'next/link'

// Marketing homepage — shown when no org context (fielddayapp.ca)
function MarketingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white">
      <h1 className="text-6xl font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
        Fieldday
      </h1>
      <p className="mt-4 text-xl text-gray-600">Sports league management, built for your community.</p>
    </main>
  )
}

// Org homepage — shown when org context is present
async function OrgHomePage({ orgId }: { orgId: string }) {
  const supabase = await createServerClient()

  const [{ data: org }, { data: branding }, { data: leagues }] = await Promise.all([
    supabase.from('organizations').select('id, slug, name').eq('id', orgId).single(),
    supabase.from('org_branding').select('tagline, hero_image_url, logo_url').eq('organization_id', orgId).single(),
    supabase.from('leagues').select('id, name, slug, league_type, status, season_start_date, price_cents, currency').eq('organization_id', orgId).in('status', ['registration_open', 'active']).order('season_start_date', { ascending: true }).limit(6),
  ])

  if (!org) return <MarketingPage />

  const orgContext = { id: org.id, slug: org.slug, name: org.name }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <OrgNav org={orgContext} logoUrl={branding?.logo_url ?? null} />

      <section className="relative py-24 px-6 text-white" style={{ backgroundColor: 'var(--brand-secondary)' }}>
        {branding?.hero_image_url && (
          <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${branding.hero_image_url})` }} />
        )}
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold uppercase tracking-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            {org.name}
          </h1>
          {branding?.tagline && <p className="mt-4 text-xl md:text-2xl opacity-80">{branding.tagline}</p>}
          <Link href="/leagues" className="mt-8 inline-block px-8 py-3 rounded-md font-semibold text-lg transition-opacity hover:opacity-90" style={{ backgroundColor: 'var(--brand-primary)', color: 'white' }}>
            View Leagues
          </Link>
        </div>
      </section>

      {leagues && leagues.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-bold mb-8 uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>Open for Registration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leagues.map((league) => (
              <Link key={league.id} href={`/leagues/${league.slug}`} className="block bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-medium uppercase tracking-wide px-2 py-1 rounded" style={{ backgroundColor: 'var(--brand-primary)', color: 'white' }}>{league.league_type}</span>
                  {league.status === 'registration_open' && <span className="text-xs text-green-600 font-medium">Open</span>}
                </div>
                <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>{league.name}</h3>
                {league.season_start_date && <p className="text-sm text-gray-500 mt-1">Starts {new Date(league.season_start_date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
                <p className="mt-3 font-semibold" style={{ color: 'var(--brand-primary)' }}>
                  {league.price_cents === 0 ? 'Free' : `$${(league.price_cents / 100).toFixed(0)} ${league.currency.toUpperCase()}`}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Footer org={orgContext} />
    </div>
  )
}

export default async function RootPage() {
  const headersList = headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) return <MarketingPage />
  return <OrgHomePage orgId={orgId} />
}
