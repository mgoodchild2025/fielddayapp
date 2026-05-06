import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import Link from 'next/link'

const EVENT_TYPE_LABELS: Record<string, string> = {
  league: 'League',
  tournament: 'Tournament',
  pickup: 'Pickup',
  drop_in: 'Drop-in',
}

export default async function StandingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  type ActiveLeague = {
    id: string
    name: string
    slug: string
    event_type: string | null
    status: string
    season_start_date: string | null
  }

  const [{ data: branding }, { data: leaguesRaw }] = await Promise.all([
    supabase
      .from('org_branding')
      .select('logo_url, tagline, contact_email, social_instagram, social_facebook, social_x, social_tiktok')
      .eq('organization_id', org.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('leagues')
      .select('id, name, slug, event_type, status, season_start_date')
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .order('season_start_date', { ascending: true }),
  ])

  const activeLeagues = (leaguesRaw ?? []) as ActiveLeague[]

  // If exactly one active league, skip the picker and go straight to standings
  if (activeLeagues.length === 1) {
    redirect(`/events/${activeLeagues[0].slug}?tab=standings`)
  }

  const brandingProps = branding
    ? {
        tagline: branding.tagline as string | null,
        hero_image_url: null,
        logo_url: branding.logo_url as string | null,
        contact_email: branding.contact_email as string | null,
        social_instagram: branding.social_instagram as string | null,
        social_facebook: branding.social_facebook as string | null,
        social_x: branding.social_x as string | null,
        social_tiktok: branding.social_tiktok as string | null,
      }
    : null

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      {/* Page header */}
      <div className="border-b" style={{ backgroundColor: 'var(--brand-secondary)' }}>
        <div className="max-w-5xl mx-auto px-6 py-8">
          <h1
            className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white"
            style={{ fontFamily: 'var(--brand-heading-font)' }}
          >
            Standings
          </h1>
          {activeLeagues.length > 0 && (
            <p className="mt-1 text-white/60 text-sm">Select a league or tournament</p>
          )}
        </div>
      </div>

      {/* League picker */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        {activeLeagues.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No active leagues right now.</p>
            <p className="text-gray-300 text-sm mt-1">Check back once the season is underway.</p>
            <Link
              href="/events"
              className="inline-block mt-6 px-5 py-2.5 rounded text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              View all events →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeLeagues.map((league) => {
              const et = league.event_type ?? 'league'
              return (
                <Link
                  key={league.id}
                  href={`/events/${league.slug}?tab=standings`}
                  className="group block bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full text-white capitalize"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      {EVENT_TYPE_LABELS[et] ?? et}
                    </span>
                    <span className="text-xs font-medium text-green-600">Active</span>
                  </div>
                  <h2
                    className="text-base font-black uppercase tracking-tight leading-snug"
                    style={{ fontFamily: 'var(--brand-heading-font)' }}
                  >
                    {league.name}
                  </h2>
                  {league.season_start_date && (
                    <p className="text-xs text-gray-400 mt-1">
                      Season started{' '}
                      {new Date(league.season_start_date).toLocaleDateString('en-CA', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                  <p
                    className="mt-4 text-sm font-semibold group-hover:underline"
                    style={{ color: 'var(--brand-primary)' }}
                  >
                    View standings →
                  </p>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <Footer org={org} social={brandingProps} />
    </div>
  )
}
