import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { checkInSelfForSession } from '@/actions/checkin'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'

function formatSessionTime(scheduledAt: string, timezone: string): string {
  return new Date(scheduledAt).toLocaleString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

export default async function SelfCheckInSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect to login, returning here after
  if (!user) {
    redirect(`/login?redirect=/checkin/session/${sessionId}`)
  }

  const db = createServiceRoleClient()

  const [{ data: branding }, { data: session }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('event_sessions')
      .select('id, scheduled_at, league_id, league:leagues!event_sessions_league_id_fkey(name)')
      .eq('id', sessionId)
      .eq('organization_id', org.id)
      .single(),
  ])

  const timezone = branding?.timezone ?? 'America/Toronto'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueData = session ? (Array.isArray(session.league) ? session.league[0] : session.league) as any : null
  const leagueName: string = leagueData?.name ?? 'Pickup Session'

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-semibold text-gray-800 mb-2">Session not found</h1>
            <p className="text-gray-500 text-sm">This check-in link may be invalid or expired.</p>
          </div>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  const sessionLabel = formatSessionTime(session.scheduled_at, timezone)

  // Run the check-in
  const result = await checkInSelfForSession(sessionId)

  let icon: string
  let heading: string
  let body: string
  let headingColor = 'text-gray-800'

  if (result.status === 'success') {
    icon = '✅'
    heading = "You're checked in!"
    body = `Welcome, ${result.playerName}. See you out there!`
    headingColor = 'text-green-700'
  } else if (result.status === 'already_checked_in') {
    const time = new Date(result.checkedInAt).toLocaleTimeString('en-CA', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    })
    icon = '✓'
    heading = 'Already checked in'
    body = `${result.playerName}, you checked in at ${time}. You're all set!`
    headingColor = 'text-blue-700'
  } else if (result.status === 'not_registered') {
    icon = '🚫'
    heading = 'Not registered for this session'
    body = result.playerName
      ? `${result.playerName}, you haven't joined this session yet. Register on the event page first.`
      : 'You haven\'t joined this session yet. Register on the event page first.'
    headingColor = 'text-red-700'
  } else {
    icon = '🔒'
    heading = 'Sign in required'
    body = 'Please sign in to check in to this session.'
    headingColor = 'text-gray-700'
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
              <p className="text-xs font-medium text-gray-700">{leagueName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sessionLabel}</p>
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
