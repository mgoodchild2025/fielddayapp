import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { StandaloneWaiverSigner } from '@/components/waivers/standalone-waiver-signer'
import Link from 'next/link'

export default async function SignWaiverPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const user = await requireAuth()

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  // Fetch branding for logo
  const { data: branding } = await supabase
    .from('org_branding')
    .select('logo_url')
    .eq('organization_id', org.id)
    .single()

  // Fetch league by slug
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (supabase as any)
    .from('leagues')
    .select('id, name, slug, waiver_version_id')
    .eq('organization_id', org.id)
    .eq('slug', slug)
    .single()

  if (!league || !league.waiver_version_id) {
    redirect(`/events/${slug}`)
  }

  // Fetch the waiver
  const { data: waiver } = await supabase
    .from('waivers')
    .select('id, title, content')
    .eq('id', league.waiver_version_id)
    .single()

  if (!waiver) {
    redirect(`/events/${slug}`)
  }

  // Check if the player has already signed the waiver for this specific event.
  // Scoped to league_id so signing for a different event doesn't block this one.
  // Cast to any because league_id is not yet in the generated Supabase types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('waiver_signatures')
    .select('id, signed_at')
    .eq('waiver_id', waiver.id)
    .eq('user_id', user.id)
    .eq('league_id', league.id)
    .maybeSingle()

  // If already signed for this event, make sure the registration row is linked.
  if (existing) {
    await supabase
      .from('registrations')
      .update({ waiver_signature_id: existing.id })
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('league_id', league.id)
      .is('waiver_signature_id', null)
  }

  // Fetch player profile for name and DOB
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const { data: playerDetails } = await supabase
    .from('player_details')
    .select('date_of_birth')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  const playerName = profile?.full_name ?? ''
  const playerDob = playerDetails?.date_of_birth ?? null

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

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
                })}
              </p>
            </div>
            <Link
              href={`/events/${slug}`}
              className="inline-block text-sm font-medium hover:underline"
              style={{ color: 'var(--brand-primary)' }}
            >
              ← Back to Event
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
            playerDob={playerDob}
          />
        )}
      </div>

      <Footer org={org} />
    </div>
  )
}
