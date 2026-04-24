import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { PendingPaymentButton } from '@/components/dashboard/pending-payment-button'
import Link from 'next/link'

export default async function PlayerDashboardPage() {
  const headersList = await headers()
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
      waiver_signature_id,
      league:leagues!registrations_league_id_fkey(id, name, slug, status, price_cents, currency, waiver_version_id),
      payment:payments!payments_registration_id_fkey(id, status, amount_cents, currency)
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

  // Fetch the org-wide active waiver id once (used as fallback when league has no specific waiver)
  const { data: orgActiveWaiver } = await supabase
    .from('waivers')
    .select('id')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .single()

  // Determine pending actions across all registrations
  const pendingActions = (registrations ?? []).filter((reg) => {
    const payment = Array.isArray(reg.payment) ? reg.payment[0] : reg.payment
    const waiverSigned = !!reg.waiver_signature_id
    const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
    const leagueRequiresWaiver = !!(league?.waiver_version_id ?? orgActiveWaiver?.id)
    const needsPayment = payment && payment.status !== 'paid'
    const needsWaiver = leagueRequiresWaiver && !waiverSigned && reg.status !== 'active'
    return needsPayment || needsWaiver
  })

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold uppercase mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          My Dashboard
        </h1>

        {/* Pending actions banner */}
        {pendingActions.length > 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              ⚠️ Action required on {pendingActions.length === 1 ? '1 registration' : `${pendingActions.length} registrations`}
            </p>
            <p className="text-xs text-amber-700">Complete the steps below to finish your registration.</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Registrations */}
          <div className="bg-white rounded-lg border p-5">
            <h2 className="font-semibold mb-4">My Leagues</h2>
            <div className="space-y-3">
              {registrations?.map((reg) => {
                const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
                const payment = Array.isArray(reg.payment) ? reg.payment[0] : reg.payment
                const waiverSigned = !!reg.waiver_signature_id
                const leagueRequiresWaiver = !!(league?.waiver_version_id ?? orgActiveWaiver?.id)

                const needsWaiver = leagueRequiresWaiver && !waiverSigned && reg.status !== 'active'
                const needsPayment = payment && payment.status !== 'paid'
                const isComplete = reg.status === 'active' && !needsPayment

                return (
                  <div key={reg.id} className={`border rounded-md p-3 ${(needsWaiver || needsPayment) ? 'border-amber-200 bg-amber-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{league?.name ?? '—'}</p>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        isComplete ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {isComplete ? 'Active' : reg.status}
                      </span>
                    </div>

                    {/* Status badges — only show waiver badge if the league requires one */}
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      {payment && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          payment.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {payment.status === 'paid' ? '✓ Paid' : 'Payment pending'}
                        </span>
                      )}
                      {leagueRequiresWaiver && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          waiverSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {waiverSigned ? '✓ Waiver signed' : 'Waiver pending'}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    {needsWaiver && league?.slug && (
                      <Link
                        href={`/register/${league.slug}`}
                        className="mt-2 block w-full py-2 px-3 rounded-md text-sm font-semibold text-center border-2 hover:bg-amber-50 transition-colors"
                        style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}
                      >
                        Sign Waiver →
                      </Link>
                    )}
                    {needsPayment && !needsWaiver && league?.slug && (
                      <PendingPaymentButton
                        leagueId={league.id}
                        leagueSlug={league.slug}
                        registrationId={reg.id}
                        orgId={org.id}
                        userId={user.id}
                        amountCents={payment.amount_cents}
                        currency={payment.currency}
                      />
                    )}
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
