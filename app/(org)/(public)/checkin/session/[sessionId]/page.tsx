import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { CheckinSoundPlayer } from '@/components/checkin/checkin-sound-player'

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

  if (!user) {
    redirect(`/login?redirect=/checkin/session/${sessionId}`)
  }

  const db = createServiceRoleClient()

  const [{ data: branding }, { data: session }, { data: profile }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone, checkin_sound').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('event_sessions')
      .select('id, scheduled_at, league_id, league:leagues!event_sessions_league_id_fkey(name)')
      .eq('id', sessionId)
      .eq('organization_id', org.id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ])

  const timezone = branding?.timezone ?? 'America/Toronto'
  const checkinSound: string | null = branding?.checkin_sound ?? null
  const playerName: string = profile?.full_name ?? 'You'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueData = session ? (Array.isArray(session.league) ? session.league[0] : session.league) as any : null
  const leagueName: string = leagueData?.name ?? 'Pickup Session'

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-semibold text-gray-800">Session not found</h1>
            <p className="text-gray-500 text-sm">This check-in link may be invalid.</p>
          </div>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  const sessionLabel = formatSessionTime(session.scheduled_at, timezone)

  // ── Perform check-in inline (not via server action, to avoid revalidatePath restriction) ──

  // Check session_registrations first (join-button flow)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessionReg } = await (db as any)
    .from('session_registrations')
    .select('id, checked_in_at')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'registered')
    .maybeSingle()

  // Check drop-in registrations (registration-flow)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dropInReg } = sessionReg ? { data: null } : await (db as any)
    .from('registrations')
    .select('id, checked_in_at')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .eq('organization_id', org.id)
    .eq('registration_type', 'drop_in')
    .neq('status', 'cancelled')
    .maybeSingle()

  const reg = sessionReg ?? dropInReg
  const table = sessionReg ? 'session_registrations' : 'registrations'

  let icon: string
  let heading: string
  let body: string
  let headingColor = 'text-gray-800'
  let playSound = false

  if (!reg) {
    icon = '🚫'
    heading = 'Not registered for this session'
    body = `${playerName}, you haven't joined this session yet. Register on the event page first.`
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from(table)
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
      body = `Welcome, ${playerName}. See you out there!`
      headingColor = 'text-green-700'
      playSound = true
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl border shadow-sm p-8 text-center space-y-4">
            {playSound && <CheckinSoundPlayer sound={checkinSound} />}
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
