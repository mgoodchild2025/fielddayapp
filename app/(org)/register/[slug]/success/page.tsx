import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function RegistrationSuccessPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { session_id?: string }
}) {
  const headersList = headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: branding } = await supabase.from('org_branding').select('logo_url').eq('organization_id', org.id).single()
  const { data: league } = await supabase.from('leagues').select('name, season_start_date').eq('organization_id', org.id).eq('slug', params.slug).single()

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <div className="text-6xl mb-4">🏐</div>
        <h1 className="text-3xl font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          You&apos;re Registered!
        </h1>
        <p className="mt-3 text-gray-600">
          You&apos;re all set for <strong>{league?.name}</strong>.
        </p>
        {league?.season_start_date && (
          <p className="mt-2 text-gray-500 text-sm">
            Season starts {new Date(league.season_start_date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/dashboard" className="px-6 py-2.5 rounded-md font-semibold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
            Go to Dashboard
          </Link>
          <Link href="/schedule" className="px-6 py-2.5 rounded-md font-semibold border text-gray-700 hover:bg-gray-50">
            View Schedule
          </Link>
        </div>
      </div>
      <Footer org={org} />
    </div>
  )
}
