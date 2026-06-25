import Link from 'next/link'
import { EventAvatar } from '@/components/ui/event-avatar'

export type UpcomingLeague = {
  id: string
  name: string
  slug: string
  event_type: string | null
  sport: string | null
  logo_url: string | null
  season_start_date: string | null
  registration_opens_at?: string | null
  teaser_text?: string | null
  featured?: boolean | null
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  league: 'League',
  tournament: 'Tournament',
  pickup: 'Pickup',
  drop_in: 'Drop-in',
}

function opensLabel(iso: string | null | undefined): string {
  if (!iso) return 'Registration opening soon'
  return `Registration opens ${new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

/**
 * "Coming Soon" showcase — advertised events that aren't open for registration
 * yet. Links to each event's public teaser (where visitors can sign up to be
 * notified). Shared across all three site themes.
 */
export function UpcomingEventsSection({ events }: { events: UpcomingLeague[] }) {
  if (!events || events.length === 0) return null
  return (
    <section className="max-w-5xl mx-auto w-full px-6 py-12">
      <h2 className="text-2xl sm:text-3xl font-bold mb-6 uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
        Coming Soon
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {events.map((league) => {
          const et = league.event_type ?? 'league'
          return (
            <Link
              key={league.id}
              href={`/events/${league.slug}`}
              className="block bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {EVENT_TYPE_LABELS[et] ?? et}
                  </span>
                  {league.sport && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                      {league.sport.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--brand-primary)', color: 'white' }}>
                  Coming Soon
                </span>
              </div>
              <div className="flex items-start gap-3 mt-2">
                <EventAvatar logoUrl={league.logo_url} name={league.name} sport={league.sport} size="md" className="shrink-0 border border-gray-100" />
                <div className="min-w-0">
                  <h3 className="text-lg font-bold leading-snug" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                    {league.name}
                  </h3>
                  {league.featured && (
                    <span className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">★ Featured</span>
                  )}
                </div>
              </div>
              {league.teaser_text && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{league.teaser_text}</p>
              )}
              <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                {opensLabel(league.registration_opens_at)} →
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
