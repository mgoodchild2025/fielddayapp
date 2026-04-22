import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export default async function LeagueDetailPage({
  params,
}: {
  params: { slug: string }
}) {
  const headersList = headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('organization_id', org.id)
    .eq('slug', params.slug)
    .neq('status', 'draft')
    .single()

  if (!league) notFound()

  const { data: branding } = await supabase
    .from('org_branding')
    .select('logo_url')
    .eq('organization_id', org.id)
    .single()

  const isOpen = league.status === 'registration_open'
  const price = league.price_cents === 0
    ? 'Free'
    : `$${(league.price_cents / 100).toFixed(0)} ${league.currency.toUpperCase()}`

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-2">
          <Link href="/leagues" className="text-sm text-gray-500 hover:underline">← All Leagues</Link>
        </div>
        <h1 className="text-4xl font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {league.name}
        </h1>
        <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
          <span className="capitalize">{league.league_type}</span>
          <span>·</span>
          <span className="capitalize">{league.sport?.replace('_', ' ')}</span>
          <span>·</span>
          <span className="font-semibold" style={{ color: 'var(--brand-primary)' }}>{price}</span>
        </div>

        {league.description && (
          <p className="mt-6 text-gray-700 leading-relaxed">{league.description}</p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4">
          {league.season_start_date && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Season Start</p>
              <p className="font-semibold mt-1">{new Date(league.season_start_date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          )}
          {league.registration_closes_at && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Registration Closes</p>
              <p className="font-semibold mt-1">{new Date(league.registration_closes_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          )}
          {league.max_teams && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Max Teams</p>
              <p className="font-semibold mt-1">{league.max_teams}</p>
            </div>
          )}
          {league.min_team_size && league.max_team_size && (
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Team Size</p>
              <p className="font-semibold mt-1">{league.min_team_size}–{league.max_team_size} players</p>
            </div>
          )}
        </div>

        {isOpen && (
          <Link
            href={`/register/${league.slug}`}
            className="mt-8 inline-block w-full text-center px-8 py-4 rounded-md font-bold text-lg uppercase tracking-wide text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--brand-primary)', fontFamily: 'var(--brand-heading-font)' }}
          >
            Register Now
          </Link>
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
