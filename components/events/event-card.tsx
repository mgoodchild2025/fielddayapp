import Link from 'next/link'
import { EventAvatar } from '@/components/ui/event-avatar'
import { formatEventPrice } from '@/lib/event-price'
import type { EventSpots } from '@/lib/event-spots'

/**
 * The open-event card — one look everywhere: the home page's Open Events
 * section and the /events listing render this same component.
 */

export type EventCardLeague = {
  slug: string
  name: string
  event_type: string | null
  sport: string | null
  logo_url: string | null
  season_start_date: string | null
  skill_level: string | null
  days_of_week: string[] | null
  game_start_time: string | null
  game_end_time: string | null
  price_cents: number
  drop_in_price_cents: number | null
  currency: string | null
  payment_mode: string | null
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  league: 'League',
  tournament: 'Tournament',
  pickup: 'Pickup',
  drop_in: 'Drop-in',
  clinic: 'Clinic',
  camp: 'Camp',
}

function timeRange(start: string | null, end: string | null): string | null {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const hr = h % 12 || 12
    return `${hr}${m ? `:${String(m).padStart(2, '0')}` : ''} ${period}`
  }
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (start) return fmt(start)
  if (end) return fmt(end)
  return null
}

export function SpotsLabel({ spots }: { spots: EventSpots | undefined }) {
  if (!spots || spots.max === null) return <span className="text-xs font-medium shrink-0 ml-2 text-green-600">Open</span>
  const left = spots.max - spots.filled
  const atCapacity = spots.filled >= spots.max
  const isLow = !atCapacity && (left <= (spots.unit === 'team' ? 3 : 5) || spots.filled / spots.max >= 0.8)
  if (atCapacity) {
    return <span className="text-xs font-medium shrink-0 ml-2 text-amber-600">{spots.unit === 'team' ? 'Teams Full' : 'Full'}</span>
  }
  if (isLow) {
    return (
      <span className="text-xs font-medium shrink-0 ml-2 text-amber-500">
        Only {left} {spots.unit} spot{left !== 1 ? 's' : ''} left
      </span>
    )
  }
  return <span className="text-xs font-medium shrink-0 ml-2 text-green-600">Open</span>
}

export function EventCard({ league, spots }: { league: EventCardLeague; spots: EventSpots | undefined }) {
  const atCapacity = spots !== undefined && spots.max !== null && spots.filled >= spots.max
  const et = league.event_type ?? 'league'

  return (
    <Link
      href={`/events/${league.slug}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
    >
      <div className="flex items-start justify-between mb-2">
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
        <SpotsLabel spots={spots} />
      </div>
      <div className="flex items-start gap-3 mt-2">
        <EventAvatar logoUrl={league.logo_url} name={league.name} sport={league.sport} size="md" className="shrink-0 border border-gray-100" />
        <h3 className="text-lg font-bold leading-snug" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {league.name}
        </h3>
      </div>
      {league.season_start_date && (
        <p className="text-sm text-gray-500 mt-1">
          Starts {new Date(league.season_start_date).toLocaleDateString('en-CA', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
      )}
      {(league.skill_level || (league.days_of_week?.length ?? 0) > 0 || league.game_start_time || league.game_end_time) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {league.skill_level && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 capitalize">
              {league.skill_level}
            </span>
          )}
          {league.days_of_week?.map((d) => (
            <span key={d} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 capitalize">
              {d}
            </span>
          ))}
          {timeRange(league.game_start_time, league.game_end_time) && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
              {timeRange(league.game_start_time, league.game_end_time)}
            </span>
          )}
        </div>
      )}
      <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
        {atCapacity
          ? 'Players can still join a team'
          : formatEventPrice(league)}
      </p>
    </Link>
  )
}
