import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import Link from 'next/link'

export default async function PlayerDashboardPage() {
  const headersList = headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: branding },
    { data: registrations },
    { data: upcomingGames },
    { data: notifications },
  ] = await Promise.all([
    supabase.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    supabase.from('registrations').select(`
      id, status, created_at,
      league:leagues!registrations_league_id_fkey(id, name, slug, status),
      payment:payments!payments_registration_id_fkey(status, amount_cents, currency),
      waiver_signature:waiver_signatures!registrations_waiver_signature_id_fkey(id)
    `).eq('organization_id', org.id).eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('games').select(`
      id, scheduled_at, court,
      home_team:teams!games_home_team_id_fkey(name),
      away_team:teams!games_away_team_id_fkey(name),
      league:leagues!games_league_id_fkey(name)
    `).eq('organization_id', org.id)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(3),
    supabase.from('notifications').select('id, title, body, read, created_at').eq('organization_id', org.id).eq('user_id', user.id).eq('read', false).order('created_at', { ascending: false }).limit(5),
  ])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold uppercase mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          My Dashboard
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Registrations */}
          <div className="bg-white rounded-lg border p-5">
            <h2 className="font-semibold mb-4">My Leagues</h2>
            <div className="space-y-3">
              {registrations?.map((reg) => {
                const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
                const payment = Array.isArray(reg.payment) ? reg.payment[0] : reg.payment
                const hasWaiver = Array.isArray(reg.waiver_signature) ? reg.waiver_signature.length > 0 : !!reg.waiver_signature
                return (
                  <div key={reg.id} className="border rounded-md p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{league?.name ?? '—'}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${reg.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {reg.status}
                          </span>
                          {payment && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${payment.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {payment.status === 'paid' ? 'Paid' : 'Payment pending'}
                            </span>
                          )}
                          {!hasWaiver && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">Waiver pending</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {(!registrations || registrations.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">You haven&apos;t registered for any leagues yet.</p>
              )}
            </div>
            <Link href="/leagues" className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Browse leagues →
            </Link>
          </div>

          {/* Upcoming Games */}
          <div className="bg-white rounded-lg border p-5">
            <h2 className="font-semibold mb-4">Upcoming Games</h2>
            <div className="space-y-3">
              {upcomingGames?.map((g) => {
                const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
                const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
                const league = Array.isArray(g.league) ? g.league[0] : g.league
                return (
                  <div key={g.id} className="border rounded-md p-3">
                    <p className="text-sm text-gray-500">
                      {new Date(g.scheduled_at).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })} · {new Date(g.scheduled_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
                      {g.court ? ` · Court ${g.court}` : ''}
                    </p>
                    <p className="font-medium mt-0.5">{homeTeam?.name ?? 'TBD'} vs {awayTeam?.name ?? 'TBD'}</p>
                    <p className="text-xs text-gray-400">{league?.name}</p>
                  </div>
                )
              })}
              {(!upcomingGames || upcomingGames.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">No upcoming games.</p>
              )}
            </div>
            <Link href="/schedule" className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Full schedule →
            </Link>
          </div>
        </div>
      </div>
      <Footer org={org} />
    </div>
  )
}
