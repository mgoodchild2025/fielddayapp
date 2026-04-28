import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { updateLeagueStatus } from '@/actions/leagues'
import { EditLeagueForm } from '@/components/leagues/edit-league-form'
import { DeleteLeagueButton } from '@/components/leagues/delete-league-button'
import { PaymentPlanConfig } from '@/components/leagues/payment-plan-config'
import type { Database } from '@/types/database'

type LeagueStatus = Database['public']['Tables']['leagues']['Row']['status']

const statusFlow: Record<string, { next: LeagueStatus; label: string }> = {
  draft: { next: 'registration_open', label: 'Open Registration' },
  registration_open: { next: 'active', label: 'Start Season' },
  active: { next: 'completed', label: 'Complete Season' },
  completed: { next: 'archived', label: 'Archive League' },
}

export default async function LeagueOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const [
    { data: league },
    { count: regCount },
    { count: teamCount },
    { count: gameCount },
    { data: waivers },
    { data: ruleTemplates },
    { data: paymentPlan },
  ] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', id).eq('organization_id', org.id).single(),
    supabase.from('registrations').select('*', { count: 'exact', head: true }).eq('league_id', id).eq('organization_id', org.id),
    supabase.from('teams').select('*', { count: 'exact', head: true }).eq('league_id', id).eq('organization_id', org.id),
    supabase.from('games').select('*', { count: 'exact', head: true }).eq('league_id', id).eq('organization_id', org.id),
    supabase.from('waivers').select('id, title, version').eq('organization_id', org.id).order('created_at', { ascending: false }),
    supabase.from('league_rule_templates').select('id, title, content').eq('organization_id', org.id).order('created_at', { ascending: false }),
    supabase.from('payment_plans').select('*').eq('league_id', id).maybeSingle(),
  ])

  if (!league) notFound()

  const transition = statusFlow[league.status]

  async function changeStatus() {
    'use server'
    if (!transition) return
    await updateLeagueStatus(id, transition.next)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Stats row */}
      <div className="md:col-span-3 grid grid-cols-3 gap-4">
        {[
          { label: 'Registrations', value: regCount ?? 0, href: `/admin/leagues/${id}/registrations` },
          { label: 'Teams', value: teamCount ?? 0, href: `/admin/leagues/${id}/teams` },
          { label: 'Games', value: gameCount ?? 0, href: `/admin/leagues/${id}/schedule` },
        ].map((stat) => (
          <a key={stat.label} href={stat.href} className="bg-white rounded-lg border p-4 hover:shadow-sm transition-shadow">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-3xl font-bold mt-1">{stat.value}</p>
          </a>
        ))}
      </div>

      {/* Details */}
      <div className="md:col-span-2 bg-white rounded-lg border p-5">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <EditLeagueForm league={league as any} waivers={waivers ?? []} ruleTemplates={ruleTemplates ?? []} />
        <dl className="space-y-3 text-sm mt-4">
          <Row label="Type" value={league.league_type} />
          <Row label="Sport" value={league.sport ?? '—'} />
          {league.age_group && <Row label="Age Group" value={league.age_group} />}
          <Row
            label="Price"
            value={league.price_cents === 0 ? 'Free' : `$${(league.price_cents / 100).toFixed(0)} ${league.currency.toUpperCase()}`}
          />
          <Row label="Payment Mode" value={league.payment_mode.replace('_', ' ')} />
          <Row label="Team Size" value={`${league.min_team_size ?? 1}–${league.max_team_size ?? '∞'} players`} />
          {league.max_teams && <Row label="Max Teams" value={String(league.max_teams)} />}
          {league.max_participants && <Row label="Max Participants" value={String(league.max_participants)} />}
          <Row label="Join Policy" value={(league.team_join_policy ?? 'open').replace('_', ' ')} />
          {league.venue_name && <Row label="Venue" value={league.venue_name} />}
          {league.venue_address && (
            <div className="flex justify-between items-center">
              <dt className="text-gray-500 text-sm">Address</dt>
              <dd className="font-medium text-sm flex items-center gap-2">
                <span>{league.venue_address}</span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(league.venue_address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on Google Maps"
                  className="shrink-0 text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </a>
              </dd>
            </div>
          )}
          {league.season_start_date && (
            <Row label="Season Start" value={new Date(league.season_start_date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })} />
          )}
          {league.season_end_date && (
            <Row label="Season End" value={new Date(league.season_end_date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })} />
          )}
          {league.registration_opens_at && (
            <Row label="Reg Opens" value={new Date(league.registration_opens_at).toLocaleString()} />
          )}
          {league.registration_closes_at && (
            <Row label="Reg Closes" value={new Date(league.registration_closes_at).toLocaleString()} />
          )}
        </dl>
        {league.description && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-gray-700">{league.description}</p>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {transition && (
          <div className="bg-white rounded-lg border p-5">
            <h2 className="font-semibold text-sm mb-3">Advance Status</h2>
            <form action={changeStatus}>
              <button
                type="submit"
                className="w-full py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {transition.label} →
              </button>
            </form>
          </div>
        )}
        <div className="bg-white rounded-lg border p-5">
          <h2 className="font-semibold text-sm mb-2">URL Slug</h2>
          <code className="text-xs bg-gray-50 border rounded px-2 py-1.5 block break-all">{league.slug}</code>
        </div>

        <PaymentPlanConfig leagueId={league.id} existing={paymentPlan ?? null} />

        <div className="bg-white rounded-lg border p-5">
          <h2 className="font-semibold text-sm mb-3 text-red-600">Danger Zone</h2>
          <DeleteLeagueButton leagueId={league.id} leagueName={league.name} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </div>
  )
}
