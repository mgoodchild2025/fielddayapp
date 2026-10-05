import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg, getOrgTimezone } from '@/lib/tenant'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { StandaloneWaiverSigner } from '@/components/waivers/standalone-waiver-signer'
import { safeRelativePath } from '@/lib/safe-redirect'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sign waiver' }

export default async function SignWaiverPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ redirect?: string }>
}) {
  const { slug } = await params
  // A newly accepted roster sub is sent here with ?redirect=/teams/<id>.
  const { redirect: redirectParam } = await searchParams
  const user = await requireAuth()

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const timeZone = await getOrgTimezone(org.id)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  // Fetch branding for logo

  const { data: branding } = await db
    .from('org_branding')
    .select('logo_url')
    .eq('organization_id', org.id)
    .single()

  // Fetch league by slug

  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, waiver_version_id')
    .eq('organization_id', org.id)
    .eq('slug', slug)
    .single()

  if (!league || !league.waiver_version_id) {
    redirect(`/events/${slug}`)
  }

  // Fetch the waiver

  const { data: waiver } = await db
    .from('waivers')
    .select('id, title, content')
    .eq('id', league.waiver_version_id)
    .single()

  if (!waiver) {
    redirect(`/events/${slug}`)
  }

  // Check if the player has already signed the waiver for this specific event.
  // Scoped to league_id so signing for a different event doesn't block this one.

  const { data: existing } = await db
    .from('waiver_signatures')
    .select('id, signed_at')
    .eq('waiver_id', waiver.id)
    .eq('user_id', user.id)
    .eq('league_id', league.id)
    .maybeSingle()

  // If already signed for this event, make sure the registration row is linked.
  if (existing) {
    await db
      .from('registrations')
      .update({ waiver_signature_id: existing.id })
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('league_id', league.id)
      .is('waiver_signature_id', null)
  }

  // Fetch player profile for name

  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const playerName = profile?.full_name ?? ''

  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <main id="main" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href={`/events/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Event
        </Link>

        {existing ? (
          // Already signed — show confirmation
          <div className="bg-white rounded-lg border p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Already Signed</h1>
              <p className="text-sm text-gray-500 mt-1">
                You signed this waiver on{' '}
                {new Date((existing as { signed_at?: string }).signed_at ?? Date.now()).toLocaleDateString('en-CA', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone,
                })}
              </p>
            </div>
            <Link
              href={safeRelativePath(redirectParam) ?? `/events/${slug}`}
              className="inline-flex items-center min-h-10 text-sm font-medium text-brand-ink hover:underline"
            >
              {safeRelativePath(redirectParam)?.startsWith('/teams/') ? 'Go to your team →' : '← Back to Event'}
            </Link>
          </div>
        ) : (
          // Not yet signed — render the signer
          <StandaloneWaiverSigner
            waiverId={waiver.id}
            waiverTitle={waiver.title}
            waiverContent={waiver.content}
            leagueId={league.id}
            leagueSlug={league.slug}
            playerName={playerName}
            redirectTo={safeRelativePath(redirectParam)}
          />
        )}
      </div>

      </main>
      <Footer org={org} />
    </div>
  )
}
