import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { GuestWaiverForm } from '@/components/waivers/guest-waiver-form'
import Link from 'next/link'

export default async function GuestWaiverPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  const supabase = await createServerClient()

  const [
    { data: branding },
    { data: league },
    { data: { user } },
  ] = await Promise.all([
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('leagues')
      .select('id, name, slug, waiver_version_id')
      .eq('slug', slug)
      .eq('organization_id', org.id)
      .single(),
    supabase.auth.getUser(),
  ])

  if (!league) notFound()

  const logoUrl = (branding as { logo_url?: string | null } | null)?.logo_url ?? null

  // Fetch the active waiver for this org (prefer league-pinned waiver if set)
  const waiverId = (league as { waiver_version_id?: string | null }).waiver_version_id
  let waiver: { id: string; title: string; content: string } | null = null

  if (waiverId) {
    const { data } = await db
      .from('waivers')
      .select('id, title, content')
      .eq('id', waiverId)
      .eq('organization_id', org.id)
      .single()
    waiver = data
  } else {
    // Fall back to the org's currently active waiver
    const { data } = await db
      .from('waivers')
      .select('id, title, content')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .single()
    waiver = data
  }

  const leagueName = (league as { name: string }).name
  const leagueId = (league as { id: string }).id

  // If no waiver is configured
  if (!waiver) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <p className="text-2xl font-bold mb-2">No waiver required</p>
          <p className="text-gray-500 text-sm">{leagueName} does not require a waiver at this time.</p>
          <Link href={`/events/${slug}`} className="mt-6 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
            ← Back to event
          </Link>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  // Prefill from logged-in user (if any)
  let prefill: { name: string; email: string } | null = null
  let alreadySignedByUser = false

  if (user) {
    const [{ data: profile }, { data: existingSig }] = await Promise.all([
      db.from('profiles').select('full_name, email').eq('id', user.id).single(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('waiver_signatures')
        .select('id')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .eq('waiver_id', waiver.id)
        .eq('league_id', leagueId)
        .maybeSingle(),
    ])

    if (profile) {
      prefill = {
        name: profile.full_name ?? '',
        email: profile.email ?? '',
      }
    }

    if (existingSig) {
      alreadySignedByUser = true
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={logoUrl} />
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="text-center mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{org.name}</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            Sign Waiver
          </h1>
          <p className="text-sm text-gray-500 mt-1">{leagueName}</p>
        </div>

        {alreadySignedByUser ? (
          <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">✓</div>
            <h2 className="text-xl font-bold mb-2">Already signed</h2>
            <p className="text-gray-500 text-sm">You&apos;ve already signed the waiver for {leagueName}. You&apos;re all set.</p>
            <Link href={`/events/${slug}`} className="mt-6 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              ← Back to event
            </Link>
          </div>
        ) : (
          <GuestWaiverForm
            waiver={waiver}
            leagueId={leagueId}
            orgId={org.id}
            prefill={prefill}
          />
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
