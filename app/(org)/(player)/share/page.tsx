import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { ShareInbox, type ShareEventOption } from '@/components/pwa/share-inbox'
import { isCloudinaryConfigured, cloudinaryApiKey, CLOUD_NAME } from '@/lib/cloudinary'

/**
 * Web Share Target landing page. Files shared from the phone are parked
 * client-side by the service worker; this page supplies the event list and
 * upload credentials and lets the player send them to an event's media queue.
 */
export default async function SharePage({ searchParams }: { searchParams: Promise<{ fallback?: string; error?: string }> }) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/share')
  const sp = await searchParams

  const db = createServiceRoleClient()
  const [{ data: branding }, { data: leagues }, { data: myTeams }, { data: myRegs }] = await Promise.all([
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).maybeSingle(),
    db.from('leagues')
      .select('id, name, slug, status, created_at')
      .eq('organization_id', org.id)
      .in('status', ['registration_open', 'active', 'completed'])
      .order('created_at', { ascending: false })
      .limit(40),
    db.from('team_members').select('teams!inner(league_id, organization_id)').eq('user_id', user.id),
    db.from('registrations').select('league_id').eq('user_id', user.id).in('status', ['active', 'pending']),
  ])

  const mine = new Set<string>()
  for (const t of (myTeams ?? []) as unknown as { teams: { league_id: string | null; organization_id: string } | null }[]) {
    if (t.teams?.organization_id === org.id && t.teams.league_id) mine.add(t.teams.league_id)
  }
  for (const r of myRegs ?? []) if (r.league_id) mine.add(r.league_id)

  const events: ShareEventOption[] = (leagues ?? [])
    .map((l) => ({ id: l.id, name: l.name, slug: l.slug, mine: mine.has(l.id) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine))

  const configured = isCloudinaryConfigured()

  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold uppercase mb-1" style={{ fontFamily: 'var(--brand-heading-font)' }}>Share to an event</h1>
        <p className="text-sm text-gray-500 mb-6">Photos and videos you share from your phone land here. Pick the event and send them for approval.</p>
        <ShareInbox
          events={events}
          orgId={org.id}
          cloudName={CLOUD_NAME}
          apiKey={configured ? cloudinaryApiKey() : ''}
          configured={configured}
          fallback={sp.fallback === '1'}
          hadError={sp.error === '1'}
        />
      </div>
      <Footer org={org} />
    </div>
  )
}
