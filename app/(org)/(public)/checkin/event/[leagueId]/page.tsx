import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'

export default async function SelfCheckInEventPage({
  params,
}: {
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/checkin/event/${leagueId}`)
  }

  const db = createServiceRoleClient()

  const [{ data: branding }, { data: league }, { data: profile }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, name').eq('id', leagueId).eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ])

  const playerName: string = profile?.full_name ?? 'You'
  const timezone = branding?.timezone ?? 'America/Toronto'

  if (!league) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-semibold text-gray-800">Event not found</h1>
            <p className="text-gray-500 text-sm">This check-in link may be invalid.</p>
          </div>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  // ── Perform check-in inline (not via server action, to avoid revalidatePath restriction) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg } = await (db as any)
    .from('registrations')
    .select('id, checked_in_at')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  let icon: string
  let heading: string
  let body: string
  let headingColor = 'text-gray-800'

  if (!reg) {
    icon = '🚫'
    heading = 'Not registered'
    body = `${playerName}, we couldn't find a registration for you in ${league.name}. Please see the event staff.`
    headingColor = 'text-red-700'
  } else if (reg.checked_in_at) {
    const time = new Date(reg.checked_in_at).toLocaleTimeString('en-CA', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    })
    icon = '✓'
    heading = 'Already checked in'
    body = `${playerName}, you checked in at ${time}. You're all set!`
    headingColor = 'text-blue-700'
  } else {
    // Mark checked in
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('registrations')
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: null })
      .eq('id', reg.id)

    if (error) {
      icon = '⚠️'
      heading = 'Check-in failed'
      body = 'Something went wrong. Please see the event staff.'
      headingColor = 'text-red-700'
    } else {
      icon = '✅'
      heading = "You're checked in!"
      body = `Welcome, ${playerName}. Enjoy ${league.name}!`
      headingColor = 'text-green-700'
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl border shadow-sm p-8 text-center space-y-4">
            <div className="text-5xl">{icon}</div>
            <div>
              <h1 className={`text-xl font-bold ${headingColor}`}>{heading}</h1>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{body}</p>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{league.name}</p>
            </div>
            <Link
              href="/schedule"
              className="inline-block mt-2 text-sm font-medium hover:underline"
              style={{ color: 'var(--brand-primary)' }}
            >
              Go to My Games →
            </Link>
          </div>
        </div>
      </div>

      <Footer org={org} />
    </div>
  )
}
