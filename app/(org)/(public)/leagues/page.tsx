import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { requireOrgMember } from '@/lib/auth'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import Link from 'next/link'

export default async function LeaguesPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org)

  const supabase = await createServerClient()
  const { data: leagues } = await supabase
    .from('leagues')
    .select('*')
    .eq('organization_id', org.id)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })

  const { data: branding } = await supabase
    .from('org_branding')
    .select('logo_url')
    .eq('organization_id', org.id)
    .single()

  const statusLabel: Record<string, string> = {
    registration_open: 'Open',
    active: 'In Season',
    completed: 'Completed',
    archived: 'Archived',
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold uppercase mb-6 sm:mb-8" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Leagues
        </h1>
        <div className="space-y-4">
          {leagues?.map((league) => (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white rounded-lg shadow-sm border p-4 sm:p-6 hover:shadow-md transition-shadow gap-3"
            >
              <div>
                <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>{league.name}</h2>
                <p className="text-sm text-gray-500 mt-1 capitalize">{league.league_type} · {league.sport?.replace('_', ' ')}</p>
              </div>
              <div className="sm:text-right flex sm:flex-col items-center sm:items-end gap-2">
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  league.status === 'registration_open' ? 'bg-green-100 text-green-800' :
                  league.status === 'active' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {statusLabel[league.status] ?? league.status}
                </span>
                {league.price_cents === 0 ? (
                  <p className="text-sm font-semibold mt-1" style={{ color: 'var(--brand-primary)' }}>Free</p>
                ) : (
                  <p className="text-sm font-semibold mt-1" style={{ color: 'var(--brand-primary)' }}>
                    ${(league.price_cents / 100).toFixed(0)} {league.currency.toUpperCase()}
                  </p>
                )}
              </div>
            </Link>
          ))}
          {(!leagues || leagues.length === 0) && (
            <p className="text-gray-500 text-center py-16">No leagues available yet.</p>
          )}
        </div>
      </div>
      <Footer org={org} />
    </div>
  )
}
