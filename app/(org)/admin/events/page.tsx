import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { DeleteEventRowButton } from '@/components/events/delete-event-row-button'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  registration_open: 'bg-green-100 text-green-700',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-purple-100 text-purple-700',
  archived: 'bg-gray-100 text-gray-400',
}

const eventTypeColors: Record<string, string> = {
  league: 'bg-indigo-100 text-indigo-700',
  tournament: 'bg-orange-100 text-orange-700',
  pickup: 'bg-teal-100 text-teal-700',
  drop_in: 'bg-pink-100 text-pink-700',
}

const eventTypeLabels: Record<string, string> = {
  league: 'League',
  tournament: 'Tournament',
  pickup: 'Pickup',
  drop_in: 'Drop-in',
}

export default async function AdminEventsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leagues } = await (supabase as any)
    .from('leagues')
    .select('id, name, slug, status, event_type, price_cents, currency, season_start_date, venue_name, created_at')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <Link
          href="/admin/events/new"
          className="px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          + New Event
        </Link>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Location</th>
              <th className="px-4 py-3 font-medium text-gray-500">Price</th>
              <th className="px-4 py-3 font-medium text-gray-500">Start Date</th>
              <th className="px-4 py-3 font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {leagues?.map((league: {
              id: string
              name: string
              slug: string
              status: string
              event_type: string | null
              price_cents: number
              currency: string
              season_start_date: string | null
              venue_name: string | null
              created_at: string
            }) => (
              <tr key={league.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/admin/events/${league.id}`} className="hover:underline" style={{ color: 'var(--brand-primary)' }}>
                    {league.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${eventTypeColors[league.event_type ?? 'league'] ?? 'bg-gray-100 text-gray-600'}`}>
                    {eventTypeLabels[league.event_type ?? 'league'] ?? league.event_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[league.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {league.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-sm">
                  {league.venue_name ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {league.price_cents === 0 ? 'Free' : `$${(league.price_cents / 100).toFixed(0)} ${league.currency.toUpperCase()}`}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {league.season_start_date ? new Date(league.season_start_date).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 flex items-center">
                  <Link href={`/admin/events/${league.id}`} className="text-xs font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
                    Manage →
                  </Link>
                  <DeleteEventRowButton leagueId={league.id} leagueName={league.name} />
                </td>
              </tr>
            ))}
            {(!leagues || leagues.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  No events yet.{' '}
                  <Link href="/admin/events/new" className="underline" style={{ color: 'var(--brand-primary)' }}>Create your first event</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
