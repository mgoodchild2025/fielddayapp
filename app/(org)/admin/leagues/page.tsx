import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { DeleteLeagueRowButton } from '@/components/leagues/delete-league-row-button'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  registration_open: 'bg-green-100 text-green-700',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-purple-100 text-purple-700',
  archived: 'bg-gray-100 text-gray-400',
}

export default async function AdminLeaguesPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, slug, status, league_type, price_cents, currency, season_start_date, created_at')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Leagues</h1>
        <Link
          href="/admin/leagues/new"
          className="px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          + New League
        </Link>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Price</th>
              <th className="px-4 py-3 font-medium text-gray-500">Start Date</th>
              <th className="px-4 py-3 font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {leagues?.map((league) => (
              <tr key={league.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{league.name}</td>
                <td className="px-4 py-3 text-gray-500 capitalize">{league.league_type}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[league.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {league.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {league.price_cents === 0 ? 'Free' : `$${(league.price_cents / 100).toFixed(0)} ${league.currency.toUpperCase()}`}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {league.season_start_date ? new Date(league.season_start_date).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 flex items-center">
                  <Link href={`/admin/leagues/${league.id}`} className="text-xs font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
                    Manage →
                  </Link>
                  <DeleteLeagueRowButton leagueId={league.id} leagueName={league.name} />
                </td>
              </tr>
            ))}
            {(!leagues || leagues.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No leagues yet.{' '}
                  <Link href="/admin/leagues/new" className="underline" style={{ color: 'var(--brand-primary)' }}>Create your first league</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
