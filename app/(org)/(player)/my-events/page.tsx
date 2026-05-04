import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  registration_open: { label: 'Open',       className: 'bg-green-50 text-green-700' },
  active:            { label: 'In Season',  className: 'bg-blue-50 text-blue-700'   },
  completed:         { label: 'Completed',  className: 'bg-gray-100 text-gray-500'  },
  archived:          { label: 'Archived',   className: 'bg-gray-100 text-gray-400'  },
  draft:             { label: 'Draft',      className: 'bg-yellow-50 text-yellow-700' },
}

export default async function MyEventsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: branding }, { data: registrations }] = await Promise.all([
    supabase.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('registrations').select(`
      id, status, created_at,
      league:leagues!registrations_league_id_fkey(
        id, name, slug, league_status:status, event_type, sport, season_start_date, season_end_date
      )
    `)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = (registrations ?? []).map((r: any) => {
    const league = Array.isArray(r.league) ? r.league[0] : r.league
    return { registrationId: r.id, league }
  }).filter((r: { league: unknown }) => r.league)

  function formatDate(iso: string | null) {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatSport(s: string) {
    return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <h1
          className="text-2xl font-bold uppercase mb-6"
          style={{ fontFamily: 'var(--brand-heading-font)' }}
        >
          My Events
        </h1>

        {events.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center">
            <p className="text-gray-400 text-sm mb-3">You haven&apos;t registered for any events yet.</p>
            <Link
              href="/events"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Browse Events
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {events.map(({ registrationId, league }: any) => {
              const statusInfo = STATUS_LABEL[league.league_status] ?? { label: league.league_status, className: 'bg-gray-100 text-gray-500' }
              return (
                <Link
                  key={registrationId}
                  href={`/events/${league.slug}`}
                  className="flex items-center gap-4 bg-white rounded-xl border px-4 py-4 hover:shadow-sm transition-shadow group"
                >
                  {/* Brand-coloured left accent */}
                  <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{league.name}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {league.sport ? formatSport(league.sport) : ''}
                      {league.sport && league.season_start_date ? ' · ' : ''}
                      {formatDate(league.season_start_date) ?? ''}
                    </p>
                  </div>

                  <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <Footer org={org} />
    </div>
  )
}
